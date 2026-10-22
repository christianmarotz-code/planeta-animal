'use client'

import { useEffect, useState } from 'react'
import { listarCambiosProveedor } from '@/lib/data/registroCambios'
import { describirCambio } from '@/lib/registro/describirCambio'
import type { RegistroCambio } from '@/types/database'

export function HistorialCambios({ proveedorId }: { proveedorId: string }) {
  const [cambios, setCambios] = useState<RegistroCambio[] | null>(null)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    listarCambiosProveedor(proveedorId)
      .then(setCambios)
      .catch(() => setFallo(true))
  }, [proveedorId])

  return (
    <div>
      <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        Historial de cambios
      </p>
      <div className="card divide-y divide-line">
        {cambios?.map((c) => (
          <p key={c.id} className="px-5 py-3 text-sm text-ink">
            <span className="mono text-ink-faint">
              {new Date(c.creado_en).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
            </span>{' '}
            — <span className="font-semibold">{c.usuario_nombre}</span>: {describirCambio(c)}
          </p>
        ))}
        {cambios?.length === 0 && <p className="px-5 py-6 text-sm text-ink-faint">Sin cambios registrados.</p>}
        {cambios === null && !fallo && <p className="px-5 py-6 text-sm text-ink-faint">Cargando…</p>}
        {fallo && <p className="px-5 py-6 text-sm text-ink-faint">No se pudo cargar el historial.</p>}
      </div>
    </div>
  )
}
