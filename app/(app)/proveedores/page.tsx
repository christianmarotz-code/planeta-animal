'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { listarProveedores } from '@/lib/data/proveedores'
import type { Proveedor } from '@/types/database'
import { SkeletonList } from '@/components/Skeleton'

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    listarProveedores()
      .then(setProveedores)
      .finally(() => setLoading(false))
  }, [])

  const filtrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase()
    if (!term) return proveedores
    return proveedores.filter(
      (p) => p.nombre.toLowerCase().includes(term) || p.cuit?.toLowerCase().includes(term)
    )
  }, [proveedores, busqueda])

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
      <input
        type="text"
        placeholder="Buscar por nombre o CUIT…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="rise w-full max-w-xs rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent"
      />
      {loading ? (
        <SkeletonList filas={8} />
      ) : (
        <div className="card rise divide-y divide-line">
          {filtrados.map((p) => (
            <Link
              key={p.id}
              href={`/proveedores/${p.id}`}
              className="flex items-center justify-between px-5 py-3.5 text-sm transition hover:bg-accent/5"
            >
              <span className="font-medium text-ink">{p.nombre}</span>
              {p.cuit && <span className="mono text-xs text-ink-faint">CUIT {p.cuit}</span>}
            </Link>
          ))}
          {filtrados.length === 0 && (
            <p className="px-5 py-6 text-sm text-ink-faint">
              {proveedores.length === 0 ? 'Sin proveedores aún.' : 'Sin proveedores que coincidan con la búsqueda.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
