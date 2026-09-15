'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listarVentas } from '@/lib/data/ventas'
import type { Venta } from '@/types/database'

export default function VentasPage() {
  const [ventas, setVentas] = useState<Venta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listarVentas()
      .then(setVentas)
      .finally(() => setLoading(false))
  }, [])

  const totalPeriodo = ventas
    .filter((v) => v.estado !== 'anulada')
    .reduce((acc, v) => acc + v.total, 0)

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-5 sm:p-8">
      <div className="rise flex items-center justify-between">
        <h1 className="text-[27px] text-ink">Ventas</h1>
        <Link href="/ventas/nueva" className="pill-btn">
          Nueva venta
        </Link>
      </div>
      {loading ? (
        <p className="text-sm text-ink-soft">Cargando…</p>
      ) : (
        <>
          <p className="rise mono text-sm text-ink-soft">
            Total: ${totalPeriodo.toLocaleString('es-AR')}
          </p>
          <ul className="divide-y divide-line rounded-[var(--r-sm)] border border-line rise">
            {ventas.map((v) => (
              <li key={v.id} className="p-3 hover:bg-surface">
                <Link href={`/ventas/${v.id}`} className="flex items-center justify-between">
                  <span className="text-sm text-ink">
                    {v.fecha} — {v.medio_pago}
                    {v.estado === 'anulada' && <span className="chip down ml-2">ANULADA</span>}
                  </span>
                  <span className="mono text-sm text-ink">${v.total.toLocaleString('es-AR')}</span>
                </Link>
              </li>
            ))}
            {ventas.length === 0 && <li className="p-3 text-sm text-ink-soft">Sin ventas aún.</li>}
          </ul>
        </>
      )}
    </div>
  )
}
