'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listarProductos } from '@/lib/data/productos'
import type { Producto } from '@/types/database'

export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [soloStockBajo, setSoloStockBajo] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    listarProductos({ soloStockBajo })
      .then(setProductos)
      .finally(() => setLoading(false))
  }, [soloStockBajo])

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Productos</h1>
        <Link href="/productos/nuevo" className="rounded bg-slate-900 px-3 py-2 text-white">
          Nuevo producto
        </Link>
      </div>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={soloStockBajo}
          onChange={(e) => setSoloStockBajo(e.target.checked)}
        />
        Mostrar solo stock bajo
      </label>
      {loading ? (
        <p>Cargando…</p>
      ) : (
        <table className="w-full border-collapse rounded border text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left">
              <th className="p-2">Nombre</th>
              <th className="p-2">Categoría</th>
              <th className="p-2">Stock actual</th>
              <th className="p-2">Costo unitario</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.id} className="border-b hover:bg-slate-50">
                <td className="p-2">
                  <Link href={`/productos/${p.id}`}>{p.nombre}</Link>
                </td>
                <td className="p-2">{p.categoria}</td>
                <td className={`p-2 ${p.stock_actual <= p.stock_minimo ? 'text-red-600' : ''}`}>
                  {p.stock_actual} {p.unidad_stock}
                </td>
                <td className="p-2">${p.costo_unitario_actual.toLocaleString('es-AR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
