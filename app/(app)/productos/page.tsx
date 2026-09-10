'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { listarProductos } from '@/lib/data/productos'
import type { Producto } from '@/types/database'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'

export default function ProductosPage() {
  const esAdmin = useEsAdministrador()
  const [productos, setProductos] = useState<Producto[]>([])
  const [soloStockBajo, setSoloStockBajo] = useState(false)
  const [categoria, setCategoria] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    listarProductos({ soloStockBajo })
      .then(setProductos)
      .finally(() => setLoading(false))
  }, [soloStockBajo])

  const categorias = useMemo(
    () => Array.from(new Set(productos.map((p) => p.categoria).filter(Boolean))).sort() as string[],
    [productos]
  )

  const filtrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase()
    return productos
      .filter((p) => (categoria ? p.categoria === categoria : true))
      .filter((p) => (term ? p.nombre.toLowerCase().includes(term) : true))
      .sort((a, b) => (a.categoria ?? '').localeCompare(b.categoria ?? '') || a.nombre.localeCompare(b.nombre))
  }, [productos, categoria, busqueda])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="flex items-center justify-between rise">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Gestión
          </p>
          <h1 className="mt-1 text-[27px] text-ink">Productos</h1>
          <p className="mt-0.5 text-sm text-ink-faint">{filtrados.length} de {productos.length} productos</p>
        </div>
        <Link href="/productos/nuevo" className="pill-btn">
          + Nuevo producto
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-3 rise">
        <input
          type="text"
          placeholder="Buscar por nombre…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full max-w-xs rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        />
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        >
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={soloStockBajo}
            onChange={(e) => setSoloStockBajo(e.target.checked)}
            className="accent-accent"
          />
          Mostrar solo stock bajo
        </label>
      </div>
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
                {esAdmin && (
                  <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Costo unitario
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p, i) => {
                const nuevaCategoria = categoria === '' && (i === 0 || filtrados[i - 1].categoria !== p.categoria)
                return (
                  <Fragment key={p.id}>
                    {nuevaCategoria && (
                      <tr key={`sep-${p.categoria}`} className="bg-surface-sunk">
                        <td
                          colSpan={esAdmin ? 4 : 3}
                          className="px-5 py-2 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint"
                        >
                          {p.categoria ?? 'Sin categoría'}
                        </td>
                      </tr>
                    )}
                    <tr className="border-b border-line transition last:border-0 hover:bg-surface-sunk">
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
                      {esAdmin && (
                        <td className="mono px-5 py-3 text-ink">
                          ${p.costo_unitario_actual.toLocaleString('es-AR')}
                        </td>
                      )}
                    </tr>
                  </Fragment>
                )
              })}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={esAdmin ? 4 : 3} className="px-5 py-6 text-sm text-ink-faint">
                    Sin productos que coincidan con el filtro.
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
