'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { obtenerVentaConItems, anularVenta } from '@/lib/data/ventas'
import { listarClientes } from '@/lib/data/clientes'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import type { Venta, ItemVenta, Cliente } from '@/types/database'

export default function DetalleVentaPage() {
  const { id } = useParams<{ id: string }>()
  const esAdmin = useEsAdministrador()
  const [venta, setVenta] = useState<Venta | null>(null)
  const [items, setItems] = useState<ItemVenta[]>([])
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [anulando, setAnulando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    obtenerVentaConItems(id).then(({ venta, items }) => {
      setVenta(venta)
      setItems(items)
      if (venta.cliente_id) {
        listarClientes().then((clientes) => {
          setCliente(clientes.find((c) => c.id === venta.cliente_id) ?? null)
        })
      }
    })
  }, [id])

  if (!venta) return <p className="p-8 text-sm text-ink-soft">Cargando…</p>

  async function handleAnular() {
    if (!confirm('¿Anular esta venta? Se repondrá el stock de los productos vendidos.')) return
    setError(null)
    setAnulando(true)
    try {
      await anularVenta(id)
      const { venta: actualizada } = await obtenerVentaConItems(id)
      setVenta(actualizada)
    } catch {
      setError('No se pudo anular la venta. Intentá de nuevo.')
    } finally {
      setAnulando(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-5 sm:p-8">
      <div className="rise">
        <h1 className="flex items-center gap-2 text-[27px] text-ink">
          Venta {venta.fecha}
          {venta.estado === 'anulada' && <span className="chip down">ANULADA</span>}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {cliente?.nombre ?? 'Sin cliente'} — {venta.medio_pago}
        </p>
      </div>
      <ul className="rise divide-y divide-line rounded-[var(--r-sm)] border border-line">
        {items.map((item) => (
          <li key={item.id} className="flex justify-between p-3 text-sm text-ink">
            <span>
              {item.cantidad} × ${item.precio_unitario.toLocaleString('es-AR')}
              {item.tipo === 'servicio' && <span className="ml-2 text-ink-faint">(servicio)</span>}
            </span>
            <span className="mono">${item.subtotal.toLocaleString('es-AR')}</span>
          </li>
        ))}
      </ul>
      <p className="rise mono text-lg text-ink">Total: ${venta.total.toLocaleString('es-AR')}</p>
      {error && <p className="text-sm text-negative">{error}</p>}
      {esAdmin === true && venta.estado !== 'anulada' && (
        <button
          type="button"
          onClick={handleAnular}
          disabled={anulando}
          className="pill-btn w-fit disabled:opacity-50"
        >
          {anulando ? 'Anulando…' : 'Anular venta'}
        </button>
      )}
    </div>
  )
}
