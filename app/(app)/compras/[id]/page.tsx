'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { obtenerFacturaConItems, anularFactura } from '@/lib/data/facturas'
import { obtenerProveedor } from '@/lib/data/proveedores'
import { listarProductos } from '@/lib/data/productos'
import type { FacturaCompra, ItemFactura, Proveedor, Producto } from '@/types/database'

export default function DetalleFacturaPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [factura, setFactura] = useState<FacturaCompra | null>(null)
  const [items, setItems] = useState<ItemFactura[]>([])
  const [proveedor, setProveedor] = useState<Proveedor | null>(null)
  const [productos, setProductos] = useState<Producto[]>([])
  const [anulando, setAnulando] = useState(false)

  useEffect(() => {
    obtenerFacturaConItems(id).then(({ factura, items }) => {
      setFactura(factura)
      setItems(items)
      obtenerProveedor(factura.proveedor_id).then(setProveedor)
    })
    listarProductos().then(setProductos)
  }, [id])

  if (!factura) return <p>Cargando…</p>

  async function handleAnular() {
    if (!confirm('¿Anular esta factura? Se revertirá el stock que sumó.')) return
    setAnulando(true)
    try {
      await anularFactura(id)
      router.refresh()
      const { factura: actualizada } = await obtenerFacturaConItems(id)
      setFactura(actualizada)
    } finally {
      setAnulando(false)
    }
  }

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold">
        {factura.tipo_comprobante} {factura.numero_comprobante}
        {factura.estado === 'anulada' && <span className="ml-2 text-sm text-red-600">ANULADA</span>}
      </h1>
      <p className="mb-4 text-sm text-slate-500">
        {proveedor?.nombre} — {factura.fecha}
      </p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-slate-50 text-left">
            <th className="p-2">Producto</th>
            <th className="p-2">Cantidad</th>
            <th className="p-2">Costo unitario</th>
            <th className="p-2">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b">
              <td className="p-2">{productos.find((p) => p.id === item.producto_id)?.nombre}</td>
              <td className="p-2">{item.cantidad}</td>
              <td className="p-2">${item.costo_unitario.toLocaleString('es-AR')}</td>
              <td className="p-2">${item.subtotal.toLocaleString('es-AR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto mt-4 w-64 rounded border p-3 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>${factura.subtotal.toLocaleString('es-AR')}</span>
        </div>
        <div className="flex justify-between">
          <span>IVA</span>
          <span>${factura.iva_total.toLocaleString('es-AR')}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <span>${factura.total.toLocaleString('es-AR')}</span>
        </div>
      </div>
      {factura.estado === 'cargada' && (
        <button
          onClick={handleAnular}
          disabled={anulando}
          className="mt-4 rounded border border-red-600 px-4 py-2 text-red-600 disabled:opacity-50"
        >
          {anulando ? 'Anulando…' : 'Anular factura'}
        </button>
      )}
    </div>
  )
}
