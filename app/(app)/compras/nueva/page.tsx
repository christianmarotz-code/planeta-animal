'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { listarProveedores } from '@/lib/data/proveedores'
import { listarProductos, crearProducto } from '@/lib/data/productos'
import { registrarFacturaCompra, type NuevaFacturaItemInput } from '@/lib/data/facturas'
import { calcularTotalesFactura } from '@/lib/calc/factura'
import type { Proveedor, Producto, TipoComprobante } from '@/types/database'

const TIPOS_COMPROBANTE: TipoComprobante[] = [
  'Factura A',
  'Factura B',
  'Factura C',
  'Remito',
  'Nota de Credito',
]

interface ItemDraft {
  producto_id: string
  productoTexto: string
  cantidad: string
  costo_unitario: string
  alicuota_iva: string
}

function emptyItem(): ItemDraft {
  return { producto_id: '', productoTexto: '', cantidad: '', costo_unitario: '', alicuota_iva: '21' }
}

export default function NuevaFacturaPage() {
  const router = useRouter()
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [proveedorId, setProveedorId] = useState('')
  const [numeroComprobante, setNumeroComprobante] = useState('')
  const [tipoComprobante, setTipoComprobante] = useState<TipoComprobante>('Factura A')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [creandoProductoIndices, setCreandoProductoIndices] = useState<Set<number>>(new Set())

  useEffect(() => {
    listarProveedores().then(setProveedores)
    listarProductos().then(setProductos)
  }, [])

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()])
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

  const itemsParaCalculo = items
    .filter((it) => it.cantidad && it.costo_unitario)
    .map((it) => ({
      cantidad: Number(it.cantidad),
      costoUnitario: Number(it.costo_unitario),
      alicuotaIva: Number(it.alicuota_iva),
    }))
  const totales = calcularTotalesFactura(itemsParaCalculo)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!proveedorId) return setError('Elegí un proveedor.')
    const itemsValidos = items.filter((it) => it.producto_id && it.cantidad && it.costo_unitario)
    if (itemsValidos.length === 0) return setError('Agregá al menos un ítem con producto, cantidad y costo.')
    for (const it of itemsValidos) {
      if (Number(it.cantidad) <= 0) return setError('Las cantidades deben ser mayores a 0.')
      if (Number(it.costo_unitario) <= 0) return setError('Los costos deben ser mayores a 0.')
    }

    const itemsInput: NuevaFacturaItemInput[] = itemsValidos.map((it) => ({
      producto_id: it.producto_id,
      cantidad: Number(it.cantidad),
      costo_unitario: Number(it.costo_unitario),
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
        total: totalesFinales.total,
        items: itemsInput,
      })
      router.push(`/compras/${id}`)
    } catch (err) {
      setError('No se pudo guardar la factura. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Nueva factura de compra</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <select
            required
            value={proveedorId}
            onChange={(e) => setProveedorId(e.target.value)}
            className="rounded border p-2"
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
            className="rounded border p-2"
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
            className="rounded border p-2"
          />
          <input
            required
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="rounded border p-2"
          />
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left">
              <th className="p-2">Producto</th>
              <th className="p-2">Cantidad</th>
              <th className="p-2">Costo unitario</th>
              <th className="p-2">IVA %</th>
              <th className="p-2">Subtotal</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const subtotalItem =
                item.cantidad && item.costo_unitario
                  ? Number(item.cantidad) * Number(item.costo_unitario)
                  : 0
              return (
                <tr key={index} className="border-b">
                  <td className="p-2">
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
                      className="w-full rounded border p-1"
                    />
                    {creandoProductoIndices.has(index) && (
                      <p className="mt-1 text-xs text-slate-500">Creando producto…</p>
                    )}
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.cantidad}
                      onChange={(e) => updateItem(index, { cantidad: e.target.value })}
                      className="w-20 rounded border p-1"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.costo_unitario}
                      onChange={(e) => updateItem(index, { costo_unitario: e.target.value })}
                      className="w-24 rounded border p-1"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.alicuota_iva}
                      onChange={(e) => updateItem(index, { alicuota_iva: e.target.value })}
                      className="w-16 rounded border p-1"
                    />
                  </td>
                  <td className="p-2">${subtotalItem.toLocaleString('es-AR')}</td>
                  <td className="p-2">
                    <button type="button" onClick={() => removeItem(index)} className="text-red-600">
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

        <button type="button" onClick={addItem} className="w-fit rounded border px-3 py-1 text-sm">
          + Agregar ítem
        </button>

        <div className="ml-auto w-64 rounded border p-3 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>${totales.subtotal.toLocaleString('es-AR')}</span>
          </div>
          <div className="flex justify-between">
            <span>IVA</span>
            <span>${totales.ivaTotal.toLocaleString('es-AR')}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span>${totales.total.toLocaleString('es-AR')}</span>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving || creandoProductoIndices.size > 0}
          className="w-fit rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {saving
            ? 'Guardando…'
            : creandoProductoIndices.size > 0
              ? 'Creando producto…'
              : 'Guardar factura'}
        </button>
      </form>
    </div>
  )
}
