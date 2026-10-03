'use client'

import { Fragment, useState } from 'react'
import { ajustarStockManual } from '@/lib/data/stock'
import type { Producto } from '@/types/database'

const TH = 'px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint'

export function TablaStock({
  productos,
  esAdmin,
  onAjustado,
  mostrarSector = false,
  textoVacio,
}: {
  productos: Producto[]
  esAdmin: boolean
  onAjustado: () => void
  /** Muestra la subcategoría bajo el nombre; sirve cuando la lista mezcla sectores. */
  mostrarSector?: boolean
  textoVacio: string
}) {
  const [ajusteAbierto, setAjusteAbierto] = useState<string | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const columnas = esAdmin ? 5 : 4

  async function handleAjustar(productoId: string) {
    setError(null)
    if (!motivo.trim()) return setError('El motivo es obligatorio.')
    if (!cantidad || Number(cantidad) === 0) return setError('Ingresá una cantidad distinta de 0.')
    try {
      await ajustarStockManual(productoId, Number(cantidad), motivo.trim())
      setAjusteAbierto(null)
      setCantidad('')
      setMotivo('')
      onAjustado()
    } catch {
      setError('No se pudo ajustar el stock. Intentá de nuevo.')
    }
  }

  return (
    <div className="card rise overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-line-strong text-left">
            <th className={TH}>Producto</th>
            <th className={TH}>Stock actual</th>
            <th className={TH}>Stock mínimo</th>
            {esAdmin && <th className={TH}>Valor (costo × stock)</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {productos.map((p) => {
            const bajo = p.stock_actual <= p.stock_minimo
            return (
              <Fragment key={p.id}>
                <tr className="border-b border-line transition last:border-0 hover:bg-accent/5">
                  <td className="px-5 py-3 text-ink">
                    {p.nombre}
                    {mostrarSector && (
                      <span className="block text-xs text-ink-faint">{p.subcategoria ?? 'Sin subcategoría'}</span>
                    )}
                  </td>
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
                  {esAdmin && (
                    <td className="mono px-5 py-3 text-ink">
                      {/* `|| 0` evita mostrar "-0" cuando el stock es negativo y el costo 0. */}
                      ${(p.stock_actual * p.costo_unitario_actual || 0).toLocaleString('es-AR')}
                    </td>
                  )}
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
                    <td colSpan={columnas} className="px-5 py-4">
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
              </Fragment>
            )
          })}
          {productos.length === 0 && (
            <tr>
              <td colSpan={columnas} className="px-5 py-6 text-sm text-ink-faint">
                {textoVacio}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
