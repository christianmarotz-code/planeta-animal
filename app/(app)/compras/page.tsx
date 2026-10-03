'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { listarFacturas } from '@/lib/data/facturas'
import { listarProveedores } from '@/lib/data/proveedores'
import type { FacturaCompra, Proveedor } from '@/types/database'
import { FilaFactura } from '@/components/FilaFactura'
import { formatearMonto } from '@/lib/calc/factura'
import { resumirPorMes } from '@/lib/facturas/meses'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'

export default function ComprasPage() {
  const esAdmin = useEsAdministrador()
  const [facturas, setFacturas] = useState<FacturaCompra[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [proveedorId, setProveedorId] = useState('')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    listarProveedores().then(setProveedores)
  }, [])

  useEffect(() => {
    listarFacturas({ proveedorId: proveedorId || undefined }).then(setFacturas)
  }, [proveedorId])

  const facturasFiltradas = useMemo(() => {
    const term = busqueda.trim().toLowerCase()
    if (!term) return facturas
    return facturas.filter((f) => {
      const proveedor = proveedores.find((p) => p.id === f.proveedor_id)
      return (
        f.numero_comprobante.toLowerCase().includes(term) ||
        proveedor?.nombre.toLowerCase().includes(term)
      )
    })
  }, [facturas, proveedores, busqueda])

  const meses = useMemo(() => resumirPorMes(facturas), [facturas])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="flex items-center justify-between rise">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Gestión
          </p>
          <h1 className="mt-1 text-[27px] text-ink">Compras</h1>
        </div>
        {esAdmin && (
          <Link href="/compras/nueva" className="pill-btn">
            + Nueva factura
          </Link>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 rise">
        <input
          type="text"
          placeholder="Buscar por proveedor o N° de comprobante…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full max-w-xs rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        />
        <select
          value={proveedorId}
          onChange={(e) => setProveedorId(e.target.value)}
          className="w-fit rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        >
          <option value="">Todos los proveedores</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>
      {busqueda.trim() ? (
        <div className="card rise divide-y divide-line">
          {facturasFiltradas.map((f) => (
            <FilaFactura
              key={f.id}
              factura={f}
              proveedor={proveedores.find((p) => p.id === f.proveedor_id)?.nombre ?? '—'}
              mostrarTotal={esAdmin === true}
            />
          ))}
          {facturasFiltradas.length === 0 && (
            <p className="px-5 py-6 text-sm text-ink-faint">Sin facturas que coincidan con la búsqueda.</p>
          )}
        </div>
      ) : meses.length === 0 ? (
        <p className="card rise px-5 py-6 text-sm text-ink-faint">Sin facturas aún.</p>
      ) : (
        <div className="grid gap-4 rise sm:grid-cols-2 lg:grid-cols-3">
          {meses.map((m) => (
            <Link
              key={m.mes}
              href={`/compras/mes/${m.mes}`}
              className="card flex flex-col gap-3 p-5 transition hover:-translate-y-0.5 hover:border-accent"
            >
              <span className="text-[17px] font-semibold text-ink">{m.etiqueta}</span>
              <span className="text-sm text-ink-soft">
                {m.cantidad} {m.cantidad === 1 ? 'factura' : 'facturas'} · {m.proveedores}{' '}
                {m.proveedores === 1 ? 'proveedor' : 'proveedores'}
              </span>
              {esAdmin && <span className="mono text-lg font-semibold text-ink">{formatearMonto(m.total)}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
