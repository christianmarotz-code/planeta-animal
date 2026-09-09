'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listarProveedores } from '@/lib/data/proveedores'
import type { Proveedor } from '@/types/database'

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listarProveedores()
      .then(setProveedores)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="flex items-center justify-between rise">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Gestión
          </p>
          <h1 className="mt-1 text-[27px] text-ink">Proveedores</h1>
        </div>
        <Link href="/proveedores/nuevo" className="pill-btn">
          + Nuevo proveedor
        </Link>
      </div>
      {loading ? (
        <p className="text-sm text-ink-soft">Cargando…</p>
      ) : (
        <div className="card rise divide-y divide-line">
          {proveedores.map((p) => (
            <Link
              key={p.id}
              href={`/proveedores/${p.id}`}
              className="flex items-center justify-between px-5 py-3.5 text-sm transition hover:bg-surface-sunk"
            >
              <span className="font-medium text-ink">{p.nombre}</span>
              {p.cuit && <span className="mono text-xs text-ink-faint">CUIT {p.cuit}</span>}
            </Link>
          ))}
          {proveedores.length === 0 && (
            <p className="px-5 py-6 text-sm text-ink-faint">Sin proveedores aún.</p>
          )}
        </div>
      )}
    </div>
  )
}
