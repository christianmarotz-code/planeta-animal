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
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="flex items-center justify-between rise">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Gestión
          </p>
          <h1 className="mt-1 text-[27px] text-ink">Productos</h1>
        </div>
        <Link href="/productos/nuevo" className="pill-btn">
          + Nuevo producto
        </Link>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-soft rise">
        <input
          type="checkbox"
          checked={soloStockBajo}
          onChange={(e) => setSoloStockBajo(e.target.checked)}
          className="accent-accent"
        />
        Mostrar solo stock bajo
      </label>
      {loading ? (
        <p className="text-sm text-ink-soft">Cargando…</p>
      ) : (
        <div className="card rise overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  Nombre
                </th>
                <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  Categoría
                </th>
                <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  Stock actual
                </th>
                <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  Costo unitario
                </th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => (
                <tr key={p.id} className="border-b border-line transition last:border-0 hover:bg-surface-sunk">
                  <td className="px-5 py-3">
                    <Link href={`/productos/${p.id}`} className="font-medium text-ink hover:text-accent">
                      {p.nombre}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-ink-soft">{p.categoria}</td>
                  <td className="px-5 py-3">
                    {p.stock_actual <= p.stock_minimo ? (
                      <span className="chip down">
                        {p.stock_actual} {p.unidad_stock}
                      </span>
                    ) : (
                      <span className="mono text-ink">
                        {p.stock_actual} {p.unidad_stock}
                      </span>
                    )}
                  </td>
                  <td className="mono px-5 py-3 text-ink">
                    ${p.costo_unitario_actual.toLocaleString('es-AR')}
                  </td>
                </tr>
              ))}
              {productos.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-sm text-ink-faint">
                    Sin productos aún.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
