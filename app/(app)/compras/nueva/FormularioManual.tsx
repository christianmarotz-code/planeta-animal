'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { listarProveedores } from '@/lib/data/proveedores'
import { listarProductos, crearProducto } from '@/lib/data/productos'
import { registrarFacturaCompra, type NuevaFacturaItemInput } from '@/lib/data/facturas'
import { calcularTotalesFactura, formatearMonto, redondearCentavos } from '@/lib/calc/factura'
import { calcularCostoRealUnitario } from '@/lib/calc/costoReal'
import type { Proveedor, Producto, TipoComprobante } from '@/types/database'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import { REPOSICION_DRAFT_KEY, type BorradorReposicion } from '@/lib/data/reposicion'
import { SelectorProntoPago } from '@/components/SelectorProntoPago'
import { TIPOS_COMPROBANTE, itemDraftVacio, validarBorradorFactura, costoConDescuento, type ItemDraft } from '@/lib/facturas/itemDraft'

export function FormularioManual() {
  const esAdmin = useEsAdministrador()
  const router = useRouter()
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [proveedorId, setProveedorId] = useState('')
  const [numeroComprobante, setNumeroComprobante] = useState('')
  const [tipoComprobante, setTipoComprobante] = useState<TipoComprobante>('Factura A')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [percepcionArba, setPercepcionArba] = useState('')
  // Tramos de pronto pago de la factura. Por defecto se asume el primero (el mejor descuento).
  const [tramos, setTramos] = useState<{ dias: string; descuento: string }[]>([])
  const [tramoElegido, setTramoElegido] = useState(0)
  const [items, setItems] = useState<ItemDraft[]>([itemDraftVacio()])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [creandoProductoIndices, setCreandoProductoIndices] = useState<Set<number>>(new Set())

  function aplicarBorradorReposicion(productosData: Producto[]) {
    const crudo = sessionStorage.getItem(REPOSICION_DRAFT_KEY)
    if (!crudo) return
    sessionStorage.removeItem(REPOSICION_DRAFT_KEY)
    try {
      const borrador: BorradorReposicion = JSON.parse(crudo)
      setProveedorId(borrador.proveedorId)
      setItems(
        borrador.items.map((item) => {
          const producto = productosData.find((p) => p.id === item.productoId)
          return {
            producto_id: item.productoId,
            productoTexto: producto?.nombre ?? '',
            cantidad: String(item.cantidad),
            costo_unitario: String(item.costoUnitario),
            alicuota_iva: String(item.alicuotaIva),
          }
        })
      )
    } catch {
      // Borrador corrupto o de una versión anterior del código — se ignora.
    }
  }

  useEffect(() => {
    Promise.all([listarProveedores(), listarProductos()]).then(([proveedoresData, productosData]) => {
      setProveedores(proveedoresData)
      setProductos(productosData)
      aplicarBorradorReposicion(productosData)
    })
  }, [])

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }

  function addItem() {
    setItems((prev) => [...prev, itemDraftVacio()])
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  async function crearProductoRapido(index: number, nombre: string) {
    setCreandoProductoIndices((prev) => new Set(prev).add(index))
    try {
      const nuevo = await crearProducto({
        nombre,
        categoria: '',
        rama: null,
        unidad_compra: 'unidad',
        unidad_stock: 'unidad',
        factor_conversion: 1,
        stock_minimo: 0,
        alicuota_iva: 21,
        activo: true,
      })
      setProductos((prev) => [...prev, nuevo])
      updateItem(index, { producto_id: nuevo.id, productoTexto: nuevo.nombre, alicuota_iva: String(nuevo.alicuota_iva) })
    } finally {
      setCreandoProductoIndices((prev) => {
        const next = new Set(prev)
        next.delete(index)
        return next
      })
    }
  }

  // Misma condición que la usada para determinar qué se guarda: ambos totales
  // (pantalla y guardado) deben calcularse a partir del mismo conjunto de filas.
  const itemsConDatos = items.filter((it) => it.cantidad && it.costo_unitario)
  const itemsParaCalculo = itemsConDatos.map((it) => ({
    cantidad: Number(it.cantidad),
    costoUnitario: costoConDescuento(Number(it.costo_unitario), Number(it.descuento) || 0),
    alicuotaIva: Number(it.alicuota_iva),
  }))
  const totales = calcularTotalesFactura(itemsParaCalculo)
  const percepcion = Number(percepcionArba) || 0
  const totalConPercepcion = redondearCentavos(totales.total + percepcion)
  const tramosValidos = tramos
    .map((t, indice) => ({ indice, dias: Number(t.dias), descuento: Number(t.descuento) }))
    .filter((t) => t.dias > 0 && t.descuento > 0 && t.descuento < 100)
  const descuentoElegido = tramosValidos.find((t) => t.indice === tramoElegido)?.descuento ?? 0
  const proveedorSeleccionado = proveedores.find((p) => p.id === proveedorId) ?? null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const errorValidacion = validarBorradorFactura({
      proveedorId,
      numeroComprobante,
      fecha,
      itemsConDatos,
    })
    if (errorValidacion) return setError(errorValidacion)

    const itemsValidos = itemsConDatos
    const itemsInput: NuevaFacturaItemInput[] = itemsValidos.map((it) => ({
      producto_id: it.producto_id,
      cantidad: Number(it.cantidad),
      costo_unitario: costoConDescuento(Number(it.costo_unitario), Number(it.descuento) || 0),
      alicuota_iva: Number(it.alicuota_iva),
    }))
    const totalesFinales = calcularTotalesFactura(
      itemsInput.map((it) => ({
        cantidad: it.cantidad,
        costoUnitario: it.costo_unitario,
        alicuotaIva: it.alicuota_iva,
      }))
    )

    setSaving(true)
    try {
      const { id } = await registrarFacturaCompra({
        proveedor_id: proveedorId,
        numero_comprobante: numeroComprobante,
        tipo_comprobante: tipoComprobante,
        fecha,
        subtotal: totalesFinales.subtotal,
        iva_total: totalesFinales.ivaTotal,
        total: redondearCentavos(totalesFinales.total + percepcion),
        percepciones_total: percepcion,
        pronto_pago: tramosValidos.map(({ dias, descuento }) => ({ dias, descuento })),
        pronto_pago_elegido: descuentoElegido,
        items: itemsInput,
      })
      router.push(`/compras/${id}`)
    } catch {
      setError('No se pudo guardar la factura. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  if (esAdmin === null) return <p className="p-8 text-sm text-ink-soft">Cargando…</p>
  if (esAdmin === false) {
    return (
      <p className="p-8 text-sm text-negative">
        Acceso restringido — contactá a un administrador.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 rise">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1.5fr_1fr]">
          <select
            required
            value={proveedorId}
            onChange={(e) => setProveedorId(e.target.value)}
            className="w-full rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
          >
            <option value="">Proveedor…</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <select
            value={tipoComprobante}
            onChange={(e) => setTipoComprobante(e.target.value as TipoComprobante)}
            className="w-full rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
          >
            {TIPOS_COMPROBANTE.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            required
            placeholder="Número de comprobante"
            value={numeroComprobante}
            onChange={(e) => setNumeroComprobante(e.target.value)}
            className="w-full rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
          />
          <input
            required
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
          />
        </div>

        <table className="card w-full border-collapse overflow-hidden text-sm">
          <thead>
            <tr className="border-b-2 border-line-strong text-left">
              <th className="w-[34%] px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Producto</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Cantidad</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Costo unitario</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">DTO %</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">IVA %</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Subtotal</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Costo real</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const subtotalItem =
                item.cantidad && item.costo_unitario
                  ? Number(item.cantidad) * costoConDescuento(Number(item.costo_unitario), Number(item.descuento) || 0)
                  : 0
              const costoReal =
                proveedorSeleccionado && item.costo_unitario
                  ? calcularCostoRealUnitario(costoConDescuento(Number(item.costo_unitario), Number(item.descuento) || 0), Number(item.alicuota_iva), {
                      aplicaIibb: proveedorSeleccionado.aplica_iibb,
                      tasaIibb: proveedorSeleccionado.tasa_iibb,
                      aplicaPercIva: proveedorSeleccionado.aplica_perc_iva,
                      tasaPercIva: proveedorSeleccionado.tasa_perc_iva,
                      descuentoProntoPago:
                        tramosValidos.length > 0 ? descuentoElegido : proveedorSeleccionado.descuento_pronto_pago,
                    })
                  : null
              return (
                <tr key={index} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-ink">
                    <input
                      list={`productos-list`}
                      placeholder="Buscar o crear producto…"
                      value={item.productoTexto}
                      onChange={(e) => {
                        const texto = e.target.value
                        const match = productos.find((p) => p.nombre === texto)
                        if (match) {
                          updateItem(index, {
                            producto_id: match.id,
                            productoTexto: texto,
                            alicuota_iva: String(match.alicuota_iva),
                          })
                        } else {
                          updateItem(index, { producto_id: '', productoTexto: texto })
                        }
                      }}
                      onBlur={() => {
                        const texto = item.productoTexto.trim()
                        const match = productos.find((p) => p.nombre === texto)
                        if (!match && texto.length > 2) {
                          crearProductoRapido(index, texto)
                        }
                      }}
                      className="w-full rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none transition focus:border-accent"
                    />
                    {creandoProductoIndices.has(index) && (
                      <p className="mt-1 text-xs text-ink-faint">Creando producto…</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.cantidad}
                      onChange={(e) => updateItem(index, { cantidad: e.target.value })}
                      className="w-full min-w-16 rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none transition focus:border-accent"
                    />
                  </td>
                  <td className="px-3 py-2 text-ink">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.costo_unitario}
                      onChange={(e) => updateItem(index, { costo_unitario: e.target.value })}
                      className="w-full min-w-28 rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none transition focus:border-accent"
                    />
                  </td>
                  <td className="px-3 py-2 text-ink">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="any"
                      value={item.descuento ?? ''}
                      onChange={(e) => updateItem(index, { descuento: e.target.value })}
                      className="w-full min-w-16 rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none transition focus:border-accent"
                    />
                  </td>
                  <td className="px-3 py-2 text-ink">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.alicuota_iva}
                      onChange={(e) => updateItem(index, { alicuota_iva: e.target.value })}
                      className="w-full min-w-16 rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none transition focus:border-accent"
                    />
                  </td>
                  <td className="mono whitespace-nowrap px-3 py-2 text-ink">{formatearMonto(subtotalItem)}</td>
                  <td className="mono whitespace-nowrap px-3 py-2 font-semibold text-ink">
                    {costoReal !== null ? formatearMonto(costoReal) : '—'}
                  </td>
                  <td className="px-3 py-2 text-ink">
                    <button type="button" onClick={() => removeItem(index)} className="text-xs font-semibold text-negative hover:underline">
                      Quitar
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <datalist id="productos-list">
          {productos.map((p) => (
            <option key={p.id} value={p.nombre} />
          ))}
        </datalist>

        <button type="button" onClick={addItem} className="pill-btn ghost w-fit">
          + Agregar ítem
        </button>

        <div className="grid items-start gap-5 lg:grid-cols-[1fr_20rem]">
          <section className="card flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Pronto pago</h2>
              <button
                type="button"
                onClick={() => setTramos((prev) => [...prev, { dias: '', descuento: '' }])}
                className="text-xs font-semibold text-accent hover:underline"
              >
                + Agregar tramo
              </button>
            </div>
            {tramos.length === 0 && (
              <p className="text-xs text-ink-faint">
                Si la factura trae descuento por pagar antes (ej. contado hasta 7 días 5%), agregalo acá.
              </p>
            )}
            {tramos.map((t, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                <span>Hasta</span>
                <input
                  type="number"
                  min={1}
                  value={t.dias}
                  onChange={(e) => setTramos((prev) => prev.map((x, j) => (j === i ? { ...x, dias: e.target.value } : x)))}
                  className="w-20 rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none transition focus:border-accent"
                />
                <span>días, dto</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  value={t.descuento}
                  onChange={(e) => setTramos((prev) => prev.map((x, j) => (j === i ? { ...x, descuento: e.target.value } : x)))}
                  className="w-20 rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none transition focus:border-accent"
                />
                <span>%</span>
                <button
                  type="button"
                  onClick={() => {
                    setTramos((prev) => prev.filter((_, j) => j !== i))
                    setTramoElegido((prev) => (prev === i ? 0 : prev > i ? prev - 1 : prev))
                  }}
                  className="text-xs font-semibold text-negative hover:underline"
                >
                  Quitar
                </button>
              </div>
            ))}
            <SelectorProntoPago
              tramos={tramosValidos.map(({ dias, descuento }) => ({ dias, descuento }))}
              elegido={descuentoElegido}
              total={totalConPercepcion}
              fechaFactura={fecha}
              onElegir={(d) => setTramoElegido(tramosValidos.find((t) => t.descuento === d)?.indice ?? -1)}
            />
          </section>

          <div className="shell">
            <div className="core flex flex-col gap-2 text-sm">
              <div className="flex justify-between text-ink-soft">
                <span>Subtotal</span>
                <span className="mono">{formatearMonto(totales.subtotal)}</span>
              </div>
              <div className="flex justify-between text-ink-soft">
                <span>IVA</span>
                <span className="mono">{formatearMonto(totales.ivaTotal)}</span>
              </div>
              <label className="flex items-center justify-between gap-2 text-ink-soft">
                <span>Percepción ARBA</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={percepcionArba}
                  onChange={(e) => setPercepcionArba(e.target.value)}
                  className="mono w-28 rounded-[var(--r-sm)] border border-line bg-surface p-1.5 text-right text-sm text-ink outline-none transition focus:border-accent"
                />
              </label>
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold text-ink">
                <span>Total</span>
                <span className="mono">{formatearMonto(totalConPercepcion)}</span>
              </div>
              {error && <p className="text-sm text-negative">{error}</p>}
              <button
                type="submit"
                disabled={saving || creandoProductoIndices.size > 0}
                className="pill-btn mt-1 w-full justify-center disabled:opacity-50"
              >
                {saving
                  ? 'Guardando…'
                  : creandoProductoIndices.size > 0
                    ? 'Creando producto…'
                    : 'Guardar factura'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
