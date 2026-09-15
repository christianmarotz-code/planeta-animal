'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listarServicios } from '@/lib/data/servicios'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import type { Servicio } from '@/types/database'

export default function ServiciosPage() {
  const esAdmin = useEsAdministrador()
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listarServicios()
      .then(setServicios)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-5 sm:p-8">
      <div className="rise flex items-center justify-between">
        <h1 className="text-[27px] text-ink">Servicios</h1>
        {esAdmin === true && (
          <Link href="/servicios/nuevo" className="pill-btn">
            Nuevo servicio
          </Link>
        )}
      </div>
      {loading ? (
        <p className="text-sm text-ink-soft">Cargando…</p>
      ) : (
        <ul className="divide-y divide-line rounded-[var(--r-sm)] border border-line rise">
          {servicios.map((s) => (
            <li key={s.id} className="flex items-center justify-between p-3">
              <div>
                <span className="font-medium text-ink">{s.nombre}</span>
                {s.categoria && <span className="ml-2 text-sm text-ink-soft">{s.categoria}</span>}
              </div>
              <span className="mono text-sm text-ink">${s.precio.toLocaleString('es-AR')}</span>
            </li>
          ))}
          {servicios.length === 0 && (
            <li className="p-3 text-sm text-ink-soft">Sin servicios aún.</li>
          )}
        </ul>
      )}
    </div>
  )
}
