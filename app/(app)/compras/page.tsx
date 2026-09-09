'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listarFacturas } from '@/lib/data/facturas'
import { listarProveedores } from '@/lib/data/proveedores'
import type { FacturaCompra, Proveedor } from '@/types/database'

export default function ComprasPage() {
  const [facturas, setFacturas] = useState<FacturaCompra[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [proveedorId, setProveedorId] = useState('')

  useEffect(() => {
    listarProveedores().then(setProveedores)
  }, [])

  useEffect(() => {
    listarFacturas({ proveedorId: proveedorId || undefined }).then(setFacturas)
  }, [proveedorId])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="flex items-center justify-between rise">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Gestión
          </p>
          <h1 className="mt-1 text-[27px] text-ink">Compras</h1>
        </div>
        <Link href="/compras/nueva" className="pill-btn">
          + Nueva factura
        </Link>
      </div>
      <select
        value={proveedorId}
        onChange={(e) => setProveedorId(e.target.value)}
        className="rise w-fit rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
      >
        <option value="">Todos los proveedores</option>
        {proveedores.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </select>
      <div className="card rise divide-y divide-line">
        {facturas.map((f) => {
          const proveedor = proveedores.find((p) => p.id === f.proveedor_id)
          return (
            <Link
              key={f.id}
              href={`/compras/${f.id}`}
              className="flex items-center justify-between px-5 py-3.5 text-sm transition hover:bg-surface-sunk"
            >
              <span className="text-ink">
                <span className="mono text-ink-faint">{f.fecha}</span> — {proveedor?.nombre ?? '—'} —{' '}
                {f.tipo_comprobante} {f.numero_comprobante}
                {f.estado === 'anulada' && <span className="chip down ml-2">ANULADA</span>}
              </span>
              <span className="mono font-semibold text-ink">${f.total.toLocaleString('es-AR')}</span>
            </Link>
          )
        })}
        {facturas.length === 0 && (
          <p className="px-5 py-6 text-sm text-ink-faint">Sin facturas aún.</p>
        )}
      </div>
    </div>
  )
}
