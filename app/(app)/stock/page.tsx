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
    await ajustarStockManual(productoId, Number(cantidad), motivo.trim())
    setAjusteAbierto(null)
    setCantidad('')
    setMotivo('')
    cargar()
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Stock</h1>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-slate-50 text-left">
            <th className="p-2">Producto</th>
            <th className="p-2">Stock actual</th>
            <th className="p-2">Stock mínimo</th>
            <th className="p-2">Valor (costo × stock)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {productos.map((p) => (
            <>
              <tr key={p.id} className="border-b">
                <td className="p-2">{p.nombre}</td>
                <td className={`p-2 ${p.stock_actual <= p.stock_minimo ? 'font-semibold text-red-600' : ''}`}>
                  {p.stock_actual} {p.unidad_stock}
                  {p.stock_actual <= p.stock_minimo && ' ⚠️'}
                </td>
                <td className="p-2">{p.stock_minimo}</td>
                <td className="p-2">
                  ${(p.stock_actual * p.costo_unitario_actual).toLocaleString('es-AR')}
                </td>
                <td className="p-2">
                  <button
                    onClick={() => setAjusteAbierto(ajusteAbierto === p.id ? null : p.id)}
                    className="text-sm text-slate-600 underline"
                  >
                    Ajustar
                  </button>
                </td>
              </tr>
              {ajusteAbierto === p.id && (
                <tr className="border-b bg-slate-50">
                  <td colSpan={5} className="p-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="text-sm">
                        Cantidad (+/- en {p.unidad_stock})
                        <input
                          type="number"
                          step="any"
                          value={cantidad}
                          onChange={(e) => setCantidad(e.target.value)}
                          className="mt-1 block w-32 rounded border p-1"
                        />
                      </label>
                      <label className="text-sm">
                        Motivo
                        <input
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                          className="mt-1 block w-64 rounded border p-1"
                        />
                      </label>
                      <button
                        onClick={() => handleAjustar(p.id)}
                        className="rounded bg-slate-900 px-3 py-1 text-white"
                      >
                        Confirmar
                      </button>
                    </div>
                    {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}
