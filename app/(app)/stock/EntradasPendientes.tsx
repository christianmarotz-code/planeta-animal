'use client'

import { useEffect, useState } from 'react'
import { listarEntradasPendientes, confirmarEntradaStock } from '@/lib/data/entradasStock'
import { listarFacturas } from '@/lib/data/facturas'
import type { EntradaStockSugerida, FacturaCompra, Producto } from '@/types/database'

export function EntradasPendientes({ productos, onConfirmada }: { productos: Producto[]; onConfirmada: () => void }) {
  const [entradas, setEntradas] = useState<EntradaStockSugerida[]>([])
  const [facturas, setFacturas] = useState<FacturaCompra[]>([])
  const [recibidas, setRecibidas] = useState<Record<string, string>>({})
  const [notas, setNotas] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<string | null>(null)

  function cargar() {
    listarEntradasPendientes().then(setEntradas).catch(() => setEntradas([]))
  }

  useEffect(() => {
    cargar()
    listarFacturas().then(setFacturas)
  }, [])

  async function confirmar(e: EntradaStockSugerida) {
    setError(null)
    const cantidad = Number(recibidas[e.id] ?? e.cantidad_sugerida)
    if (Number.isNaN(cantidad) || cantidad < 0) return setError('La cantidad recibida no es válida.')
    setConfirmando(e.id)
    try {
      await confirmarEntradaStock(e.id, cantidad, notas[e.id]?.trim() || null)
      cargar()
      onConfirmada()
    } catch {
      setError('No se pudo confirmar la entrada. Intentá de nuevo.')
    } finally {
      setConfirmando(null)
    }
  }

  if (entradas.length === 0) return null

  return (
    <div className="card rise overflow-x-auto">
      <p className="px-5 pt-4 text-sm font-semibold text-ink">
        Entradas pendientes de confirmar ({entradas.length})
      </p>
      <p className="px-5 pb-2 text-xs text-ink-faint">
        Confirmá lo que realmente llegó. Si falta mercadería o vino rota, cambiá la cantidad y dejá una nota.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-line-strong text-left text-[11.5px] uppercase tracking-[0.1em] text-ink-faint">
            <th className="px-5 py-2 font-semibold">Producto</th>
            <th className="px-5 py-2 font-semibold">Comprobante</th>
            <th className="px-5 py-2 font-semibold">Sugerida</th>
            <th className="px-5 py-2 font-semibold">Recibida</th>
            <th className="px-5 py-2 font-semibold">Nota</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {entradas.map((e) => (
            <tr key={e.id} className="border-b border-line last:border-0">
              <td className="px-5 py-3 text-ink">{productos.find((p) => p.id === e.producto_id)?.nombre ?? '—'}</td>
              <td className="mono px-5 py-3 text-ink-soft">
                {facturas.find((f) => f.id === e.factura_id)?.numero_comprobante ?? '—'}
              </td>
              <td className="mono px-5 py-3 text-ink">{e.cantidad_sugerida}</td>
              <td className="px-5 py-3">
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={recibidas[e.id] ?? String(e.cantidad_sugerida)}
                  onChange={(ev) => setRecibidas((prev) => ({ ...prev, [e.id]: ev.target.value }))}
                  className="w-24 rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none focus:border-accent"
                />
              </td>
              <td className="px-5 py-3">
                <input
                  placeholder="Opcional"
                  value={notas[e.id] ?? ''}
                  onChange={(ev) => setNotas((prev) => ({ ...prev, [e.id]: ev.target.value }))}
                  className="w-full min-w-40 rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none focus:border-accent"
                />
              </td>
              <td className="px-5 py-3">
                <button
                  type="button"
                  disabled={confirmando === e.id}
                  onClick={() => confirmar(e)}
                  className="pill-btn disabled:opacity-50"
                >
                  {confirmando === e.id ? 'Confirmando…' : 'Confirmar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p className="px-5 pb-3 text-sm text-negative">{error}</p>}
    </div>
  )
}
