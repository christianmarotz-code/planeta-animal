'use client'

import { useEffect, useState } from 'react'
import { listarProductos } from '@/lib/data/productos'
import { ajustarStockManual } from '@/lib/data/stock'
import type { Producto } from '@/types/database'

export default function StockPage() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [ajusteAbierto, setAjusteAbierto] = useState<string | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)

  function cargar() {
    listarProductos().then(setProductos)
  }

  useEffect(cargar, [])

  async function handleAjustar(productoId: string) {
    setError(null)
    if (!motivo.trim()) return setError('El motivo es obligatorio.')
    if (!cantidad || Number(cantidad) === 0) return setError('Ingresá una cantidad distinta de 0.')
    try {
      await ajustarStockManual(productoId, Number(cantidad), motivo.trim())
      setAjusteAbierto(null)
      setCantidad('')
      setMotivo('')
      cargar()
    } catch (err) {
      setError('No se pudo ajustar el stock. Intentá de nuevo.')
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="rise">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Gestión
        </p>
        <h1 className="mt-1 text-[27px] text-ink">Stock</h1>
      </div>
      <div className="card rise overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                Producto
              </th>
              <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                Stock actual
              </th>
              <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                Stock mínimo
              </th>
              <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                Valor (costo × stock)
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => {
              const bajo = p.stock_actual <= p.stock_minimo
              return (
                <>
                  <tr key={p.id} className="border-b border-line transition last:border-0 hover:bg-surface-sunk">
                    <td className="px-5 py-3 text-ink">{p.nombre}</td>
                    <td className="px-5 py-3">
                      {bajo ? (
                        <span className="chip down">
                          {p.stock_actual} {p.unidad_stock}
                        </span>
                      ) : (
                        <span className="mono text-ink">
                          {p.stock_actual} {p.unidad_stock}
                        </span>
                      )}
                    </td>
                    <td className="mono px-5 py-3 text-ink-soft">{p.stock_minimo}</td>
                    <td className="mono px-5 py-3 text-ink">
                      ${(p.stock_actual * p.costo_unitario_actual).toLocaleString('es-AR')}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => {
                          setAjusteAbierto(ajusteAbierto === p.id ? null : p.id)
                          setCantidad('')
                          setMotivo('')
                          setError(null)
                        }}
                        className="text-xs font-semibold text-accent hover:underline"
                      >
                        Ajustar
                      </button>
                    </td>
                  </tr>
                  {ajusteAbierto === p.id && (
                    <tr className="border-b border-line bg-surface-sunk">
                      <td colSpan={5} className="px-5 py-4">
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="text-sm text-ink-soft">
                            Cantidad (+/- en {p.unidad_stock})
                            <input
                              type="number"
                              step="any"
                              value={cantidad}
                              onChange={(e) => setCantidad(e.target.value)}
                              className="mt-1 block w-32 rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none focus:border-accent"
                            />
                          </label>
                          <label className="text-sm text-ink-soft">
                            Motivo
                            <input
                              value={motivo}
                              onChange={(e) => setMotivo(e.target.value)}
                              className="mt-1 block w-64 rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none focus:border-accent"
                            />
                          </label>
                          <button onClick={() => handleAjustar(p.id)} className="pill-btn">
                            Confirmar
                          </button>
                        </div>
                        {error && <p className="mt-2 text-sm text-negative">{error}</p>}
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
            {productos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-sm text-ink-faint">
                  Sin productos aún.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
