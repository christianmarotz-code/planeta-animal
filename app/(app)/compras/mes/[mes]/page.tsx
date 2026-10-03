'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { listarFacturas } from '@/lib/data/facturas'
import { listarProveedores } from '@/lib/data/proveedores'
import { formatearMonto } from '@/lib/calc/factura'
import { etiquetaMes, rangoDelMes } from '@/lib/facturas/meses'
import { FilaFactura } from '@/components/FilaFactura'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import type { FacturaCompra, Proveedor } from '@/types/database'

export default function ComprasDelMesPage() {
  const { mes } = useParams<{ mes: string }>()
  const esAdmin = useEsAdministrador()
  const [facturas, setFacturas] = useState<FacturaCompra[] | null>(null)
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [proveedorId, setProveedorId] = useState('')

  useEffect(() => {
    listarProveedores().then(setProveedores)
  }, [])

  useEffect(() => {
    const { desde, hasta } = rangoDelMes(mes)
    listarFacturas({ proveedorId: proveedorId || undefined, desde, hasta }).then(setFacturas)
  }, [mes, proveedorId])

  const total = useMemo(
    () => (facturas ?? []).filter((f) => f.estado !== 'anulada').reduce((acc, f) => acc + f.total, 0),
    [facturas]
  )
  const nombreProveedor = (id: string) => proveedores.find((p) => p.id === id)?.nombre ?? '—'

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3 rise">
        <div>
          <Link href="/compras" className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint hover:text-ink">
            ← Compras
          </Link>
          <h1 className="mt-1 text-[27px] text-ink">{etiquetaMes(mes)}</h1>
          {facturas && (
            <p className="mt-1 text-sm text-ink-soft">
              {facturas.length} {facturas.length === 1 ? 'factura' : 'facturas'}
              {esAdmin && (
                <>
                  {' '}
                  · <span className="mono font-semibold text-ink">{formatearMonto(total)}</span>
                </>
              )}
            </p>
          )}
        </div>
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
      <div className="card rise divide-y divide-line">
        {facturas === null && <p className="px-5 py-6 text-sm text-ink-soft">Cargando…</p>}
        {facturas?.map((f) => (
          <FilaFactura key={f.id} factura={f} proveedor={nombreProveedor(f.proveedor_id)} mostrarTotal={esAdmin === true} />
        ))}
        {facturas?.length === 0 && <p className="px-5 py-6 text-sm text-ink-faint">Sin facturas en este mes.</p>}
      </div>
    </div>
  )
}
