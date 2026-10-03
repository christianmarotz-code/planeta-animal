'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { obtenerFacturaConItems, anularFactura, editarFacturaCompra } from '@/lib/data/facturas'
import { obtenerProveedor, listarProveedores } from '@/lib/data/proveedores'
import { listarProductos, obtenerProducto, crearProducto } from '@/lib/data/productos'
import { calcularCostoRealUnitario } from '@/lib/calc/costoReal'
import { calcularTotalesFactura } from '@/lib/calc/factura'
import type { FacturaCompra, ItemFactura, Proveedor, Producto, TipoComprobante } from '@/types/database'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import { TIPOS_COMPROBANTE, validarBorradorFactura, type ItemDraft } from '@/lib/facturas/itemDraft'

export default function DetalleFacturaPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const esAdmin = useEsAdministrador()
  const [factura, setFactura] = useState<FacturaCompra | null>(null)
  const [items, setItems] = useState<ItemFactura[]>([])
  const [proveedor, setProveedor] = useState<Proveedor | null>(null)
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [anulando, setAnulando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editando, setEditando] = useState(false)
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null)
  const [proveedorIdEdit, setProveedorIdEdit] = useState('')
  const [numeroComprobanteEdit, setNumeroComprobanteEdit] = useState('')
  const [tipoComprobanteEdit, setTipoComprobanteEdit] = useState<TipoComprobante>('Factura A')
  const [fechaEdit, setFechaEdit] = useState('')
  // El editor manual no conoce bonificaciones ni percepciones: corregir una factura leída con
  // detalle borraría ese detalle. Esas facturas se corrigen anulando y volviendo a cargar.
  const tieneDetalleInteligente = items.some((it) => it.total_linea !== null)
  const [itemsEdit, setItemsEdit] = useState<ItemDraft[]>([])
  const [creandoProductoIndices, setCreandoProductoIndices] = useState<Set<number>>(new Set())

  const productosPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos])

  useEffect(() => {
    obtenerFacturaConItems(id).then(({ factura, items }) => {
      setFactura(factura)
      setItems(items)
      obtenerProveedor(factura.proveedor_id).then(setProveedor)
    })
    listarProveedores().then(setProveedores)
    listarProductos().then(setProductos)
  }, [id])

  if (!factura) return <p className="p-8 text-sm text-ink-soft">Cargando…</p>

  async function handleAnular() {
    if (!confirm('¿Anular esta factura? Se revertirá el stock que sumó.')) return
    setError(null)
    setAnulando(true)
    try {
      await anularFactura(id)
      router.refresh()
      const { factura: actualizada } = await obtenerFacturaConItems(id)
      setFactura(actualizada)
    } catch {
      setError('No se pudo anular la factura. Intentá de nuevo.')
    } finally {
      setAnulando(false)
    }
  }

  async function iniciarEdicion() {
    if (!factura) return
    setErrorEdicion(null)
    setProveedorIdEdit(factura.proveedor_id)
    setNumeroComprobanteEdit(factura.numero_comprobante)
    setTipoComprobanteEdit(factura.tipo_comprobante)
    setFechaEdit(factura.fecha)

    // listarProductos() solo trae productos activos: si esta factura tiene un
    // ítem de un producto que después se desactivó, no aparece ahí. Sin esto
    // el campo se ve vacío y, al no poder re-matchearlo desde el datalist,
    // termina marcado como "sin producto asignado" y bloqueando el guardado.
    const idsFaltantes = [...new Set(items.map((item) => item.producto_id))].filter(
      (id): id is string => id !== null && !productos.some((p) => p.id === id)
    )
    const faltantes = idsFaltantes.length > 0 ? await Promise.all(idsFaltantes.map((id) => obtenerProducto(id))) : []
    if (faltantes.length > 0) setProductos((prev) => [...prev, ...faltantes])
    const todosLosProductos = [...productos, ...faltantes]

    setItemsEdit(
      items.map((item) => ({
        producto_id: item.producto_id ?? '',
        productoTexto:
          todosLosProductos.find((p) => p.id === item.producto_id)?.nombre ??
          item.descripcion_original ??
          '',
        cantidad: String(item.cantidad),
        costo_unitario: String(item.costo_unitario),
        alicuota_iva: String(item.alicuota_iva),
      }))
    )
    setEditando(true)
  }

  function actualizarItemEdit(index: number, patch: Partial<ItemDraft>) {
    setItemsEdit((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }

  function agregarItemEdit() {
    setItemsEdit((prev) => [
      ...prev,
      { producto_id: '', productoTexto: '', cantidad: '', costo_unitario: '', alicuota_iva: '21' },
    ])
  }

  function quitarItemEdit(index: number) {
    setItemsEdit((prev) => prev.filter((_, i) => i !== index))
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
      actualizarItemEdit(index, { producto_id: nuevo.id, productoTexto: nuevo.nombre, alicuota_iva: String(nuevo.alicuota_iva) })
    } finally {
      setCreandoProductoIndices((prev) => {
        const next = new Set(prev)
        next.delete(index)
        return next
      })
    }
  }

  const itemsEditConDatos = itemsEdit.filter((it) => it.cantidad && it.costo_unitario)
  const totalesEdit = calcularTotalesFactura(
    itemsEditConDatos.map((it) => ({
      cantidad: Number(it.cantidad),
      costoUnitario: Number(it.costo_unitario),
      alicuotaIva: Number(it.alicuota_iva),
    }))
  )

  async function handleGuardarEdicion() {
    setErrorEdicion(null)
    const errorValidacion = validarBorradorFactura({
      proveedorId: proveedorIdEdit,
      numeroComprobante: numeroComprobanteEdit,
      fecha: fechaEdit,
      itemsConDatos: itemsEditConDatos,
    })
    if (errorValidacion) return setErrorEdicion(errorValidacion)

    setGuardandoEdicion(true)
    try {
      await editarFacturaCompra(id, {
        proveedor_id: proveedorIdEdit,
        numero_comprobante: numeroComprobanteEdit,
        tipo_comprobante: tipoComprobanteEdit,
        fecha: fechaEdit,
        subtotal: totalesEdit.subtotal,
        iva_total: totalesEdit.ivaTotal,
        total: totalesEdit.total,
        items: itemsEditConDatos.map((it) => ({
          producto_id: it.producto_id,
          cantidad: Number(it.cantidad),
          costo_unitario: Number(it.costo_unitario),
          alicuota_iva: Number(it.alicuota_iva),
        })),
      })
      const { factura: actualizada, items: itemsActualizados } = await obtenerFacturaConItems(id)
      setFactura(actualizada)
      setItems(itemsActualizados)
      obtenerProveedor(actualizada.proveedor_id).then(setProveedor)
      setEditando(false)
      router.refresh()
    } catch (err) {
      setErrorEdicion(err instanceof Error ? err.message : 'No se pudieron guardar los cambios. Intentá de nuevo.')
    } finally {
      setGuardandoEdicion(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-5 sm:p-8">
      <div className="rise">
        <h1 className="flex items-center gap-2 text-[27px] text-ink">
          {factura.tipo_comprobante} {factura.numero_comprobante}
          {factura.estado === 'anulada' && <span className="chip down">ANULADA</span>}
          {factura.estado === 'revision' && <span className="chip down">REQUIERE REVISIÓN</span>}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {proveedor?.nombre} — <span className="mono">{factura.fecha}</span>
        </p>
      </div>

      {!editando && (
        <>
          <div className="card rise overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-line-strong text-left">
                  <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Producto
                  </th>
                  <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Cantidad
                  </th>
                  {esAdmin && (
                    <>
                      <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                        Costo neto
                      </th>
                      <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                        Costo real (con imp.)
                      </th>
                      <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                        Subtotal
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const costoReal = proveedor
                    ? calcularCostoRealUnitario(item.costo_unitario, item.alicuota_iva, {
                        aplicaIibb: proveedor.aplica_iibb,
                        tasaIibb: proveedor.tasa_iibb,
                        aplicaPercIva: proveedor.aplica_perc_iva,
                        tasaPercIva: proveedor.tasa_perc_iva,
                        descuentoProntoPago: proveedor.descuento_pronto_pago,
                      })
                    : null
                  return (
                    <tr key={item.id} className="border-b border-line last:border-0">
                      <td className="px-5 py-3 text-ink">
                        {(item.producto_id && productosPorId.get(item.producto_id)?.nombre) || item.descripcion_original}
                      </td>
                      <td className="mono px-5 py-3 text-ink">{item.cantidad}</td>
                      {esAdmin && (
                        <>
                          <td className="mono px-5 py-3 text-ink-soft">
                            ${item.costo_unitario.toLocaleString('es-AR')}
                          </td>
                          <td className="mono px-5 py-3 font-semibold text-ink">
                            {costoReal !== null ? `$${costoReal.toLocaleString('es-AR')}` : '—'}
                          </td>
                          <td className="mono px-5 py-3 text-ink">${item.subtotal.toLocaleString('es-AR')}</td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {esAdmin &&
            proveedor &&
            (proveedor.aplica_iibb || proveedor.aplica_perc_iva || proveedor.descuento_pronto_pago > 0) && (
              <p className="text-xs text-ink-faint rise">
                Costo real = costo neto × (1 + IVA
                {proveedor.aplica_iibb && ` + II.BB. ${proveedor.tasa_iibb}%`}
                {proveedor.aplica_perc_iva && ` + Perc. IVA ${proveedor.tasa_perc_iva}%`}) ×{' '}
                {proveedor.descuento_pronto_pago > 0
                  ? `(1 − ${proveedor.descuento_pronto_pago}% dto. pronto pago)`
                  : '1'}{' '}
                — configurado en la ficha de {proveedor.nombre}.
              </p>
            )}

          {esAdmin && (
            <div className="shell ml-auto w-72 rise">
              <div className="core flex flex-col gap-2 text-sm">
                <div className="flex justify-between text-ink-soft">
                  <span>Subtotal</span>
                  <span className="mono">${factura.subtotal.toLocaleString('es-AR')}</span>
                </div>
                <div className="flex justify-between text-ink-soft">
                  <span>IVA</span>
                  <span className="mono">${factura.iva_total.toLocaleString('es-AR')}</span>
                </div>
                <div className="flex justify-between border-t border-line pt-2 font-semibold text-ink">
                  <span>Total</span>
                  <span className="mono">${factura.total.toLocaleString('es-AR')}</span>
                </div>
              </div>
            </div>
          )}

          {factura.estado !== 'anulada' && (
            <div className="flex flex-wrap gap-2 rise">
              {esAdmin && !tieneDetalleInteligente && (
                <button onClick={iniciarEdicion} className="pill-btn ghost">
                  ✏️ Corregir factura
                </button>
              )}
              <button
                onClick={handleAnular}
                disabled={anulando}
                className="pill-btn ghost !text-negative disabled:opacity-50"
              >
                {anulando ? 'Anulando…' : 'Anular factura'}
              </button>
              {error && <p className="w-full text-sm text-negative">{error}</p>}
            </div>
          )}
        </>
      )}

      {editando && (
        <div className="flex flex-col gap-5 rise">
          <p className="text-sm text-ink-faint">
            Corrigiendo esta factura: el stock que había sumado se revierte y se vuelve a aplicar con
            los datos nuevos al guardar.
          </p>
          <div className="flex flex-wrap gap-2">
            <select
              required
              value={proveedorIdEdit}
              onChange={(e) => setProveedorIdEdit(e.target.value)}
              className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
            >
              <option value="">Proveedor…</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <select
              value={tipoComprobanteEdit}
              onChange={(e) => setTipoComprobanteEdit(e.target.value as TipoComprobante)}
              className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
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
              value={numeroComprobanteEdit}
              onChange={(e) => setNumeroComprobanteEdit(e.target.value)}
              className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
            />
            <input
              required
              type="date"
              value={fechaEdit}
              onChange={(e) => setFechaEdit(e.target.value)}
              className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
            />
          </div>

          <table className="card w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-line-strong text-left">
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Producto</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Cantidad</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Costo unitario</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">IVA %</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {itemsEdit.map((item, index) => (
                <tr key={index} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-ink">
                    <input
                      list="productos-list-edicion"
                      placeholder="Buscar o crear producto…"
                      value={item.productoTexto}
                      onChange={(e) => {
                        const texto = e.target.value
                        const match = productos.find((p) => p.nombre === texto)
                        actualizarItemEdit(index, {
                          productoTexto: texto,
                          producto_id: match?.id ?? '',
                          ...(match ? { alicuota_iva: String(match.alicuota_iva) } : {}),
                        })
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
                      onChange={(e) => actualizarItemEdit(index, { cantidad: e.target.value })}
                      className="w-20 rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none transition focus:border-accent"
                    />
                  </td>
                  <td className="px-3 py-2 text-ink">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.costo_unitario}
                      onChange={(e) => actualizarItemEdit(index, { costo_unitario: e.target.value })}
                      className="w-24 rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none transition focus:border-accent"
                    />
                  </td>
                  <td className="px-3 py-2 text-ink">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.alicuota_iva}
                      onChange={(e) => actualizarItemEdit(index, { alicuota_iva: e.target.value })}
                      className="w-16 rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none transition focus:border-accent"
                    />
                  </td>
                  <td className="px-3 py-2 text-ink">
                    <button type="button" onClick={() => quitarItemEdit(index)} className="text-xs font-semibold text-negative hover:underline">
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="productos-list-edicion">
            {productos.map((p) => (
              <option key={p.id} value={p.nombre} />
            ))}
          </datalist>

          <button type="button" onClick={agregarItemEdit} className="pill-btn ghost w-fit">
            + Agregar ítem
          </button>

          <div className="shell ml-auto w-64">
            <div className="core flex flex-col gap-2 text-sm">
              <div className="flex justify-between text-ink-soft">
                <span>Subtotal</span>
                <span className="mono">${totalesEdit.subtotal.toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between text-ink-soft">
                <span>IVA</span>
                <span className="mono">${totalesEdit.ivaTotal.toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between border-t border-line pt-2 font-semibold text-ink">
                <span>Total</span>
                <span className="mono">${totalesEdit.total.toLocaleString('es-AR')}</span>
              </div>
            </div>
          </div>

          {errorEdicion && <p className="text-sm text-negative">{errorEdicion}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleGuardarEdicion}
              disabled={guardandoEdicion || creandoProductoIndices.size > 0}
              className="pill-btn w-fit disabled:opacity-50"
            >
              {guardandoEdicion
                ? 'Guardando…'
                : creandoProductoIndices.size > 0
                  ? 'Creando producto…'
                  : 'Guardar cambios'}
            </button>
            <button
              type="button"
              onClick={() => setEditando(false)}
              disabled={guardandoEdicion}
              className="pill-btn ghost w-fit disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
