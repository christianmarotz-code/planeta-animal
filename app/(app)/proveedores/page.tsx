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
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Proveedores</h1>
        <Link href="/proveedores/nuevo" className="rounded bg-slate-900 px-3 py-2 text-white">
          Nuevo proveedor
        </Link>
      </div>
      {loading ? (
        <p>Cargando…</p>
      ) : (
        <ul className="divide-y rounded border">
          {proveedores.map((p) => (
            <li key={p.id} className="p-3 hover:bg-slate-50">
              <Link href={`/proveedores/${p.id}`}>
                <span className="font-medium">{p.nombre}</span>
                {p.cuit && <span className="ml-2 text-sm text-slate-500">CUIT {p.cuit}</span>}
              </Link>
            </li>
          ))}
          {proveedores.length === 0 && <li className="p-3 text-slate-500">Sin proveedores aún.</li>}
        </ul>
      )}
    </div>
  )
}
