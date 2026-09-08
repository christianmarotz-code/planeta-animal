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
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Compras</h1>
        <Link href="/compras/nueva" className="rounded bg-slate-900 px-3 py-2 text-white">
          Nueva factura
        </Link>
      </div>
      <select
        value={proveedorId}
        onChange={(e) => setProveedorId(e.target.value)}
        className="mb-3 rounded border p-2"
      >
        <option value="">Todos los proveedores</option>
        {proveedores.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </select>
      <ul className="divide-y rounded border">
        {facturas.map((f) => {
          const proveedor = proveedores.find((p) => p.id === f.proveedor_id)
          return (
            <li key={f.id} className="p-3 hover:bg-slate-50">
              <Link href={`/compras/${f.id}`} className="flex justify-between">
                <span>
                  {f.fecha} — {proveedor?.nombre ?? '—'} — {f.tipo_comprobante} {f.numero_comprobante}
                  {f.estado === 'anulada' && (
                    <span className="ml-2 text-xs text-red-600">ANULADA</span>
                  )}
                </span>
                <span>${f.total.toLocaleString('es-AR')}</span>
              </Link>
            </li>
          )
        })}
        {facturas.length === 0 && <li className="p-3 text-slate-500">Sin facturas aún.</li>}
      </ul>
    </div>
  )
}
