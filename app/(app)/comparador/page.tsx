'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { mensajeDeError } from '@/lib/errores'
import { listarComparador, type FilaComparador } from '@/lib/data/preciosProveedor'
import { listarProveedores } from '@/lib/data/proveedores'
import type { Proveedor } from '@/types/database'
import { SkeletonList } from '@/components/Skeleton'
import { VistaProveedores } from './VistaProveedores'
import { VistaProductos } from './VistaProductos'

type Vista = 'proveedor' | 'producto'

const PESTANA_ACTIVA = 'rounded-full bg-accent px-4 py-2 text-sm font-semibold text-[var(--accent-ink)]'
const PESTANA_INACTIVA = 'rounded-full px-4 py-2 text-sm text-ink-soft transition hover:text-ink'

export default function ComparadorPage() {
  const [vista, setVista] = useState<Vista>('proveedor')
  const [filas, setFilas] = useState<FilaComparador[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listarComparador(), listarProveedores()])
      .then(([filasCargadas, proveedoresCargados]) => {
        setFilas(filasCargadas)
        setProveedores(proveedoresCargados)
      })
      .catch((err) => setError(mensajeDeError(err, 'No se pudo cargar el comparador.')))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="flex items-center justify-between rise">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Gestión</p>
          <h1 className="mt-1 text-[27px] text-ink">Comparador de precios</h1>
        </div>
        <Link href="/comparador/importar" className="pill-btn">
          + Importar lista
        </Link>
      </div>

      <div className="flex gap-2 rise" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={vista === 'proveedor'}
          onClick={() => setVista('proveedor')}
          className={vista === 'proveedor' ? PESTANA_ACTIVA : PESTANA_INACTIVA}
        >
          Por proveedor
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={vista === 'producto'}
          onClick={() => setVista('producto')}
          className={vista === 'producto' ? PESTANA_ACTIVA : PESTANA_INACTIVA}
        >
          Por producto
        </button>
      </div>

      {error && <p className="text-sm text-negative">{error}</p>}

      {loading ? (
        <SkeletonList filas={6} />
      ) : vista === 'proveedor' ? (
        <VistaProveedores filas={filas} proveedores={proveedores} />
      ) : (
        <VistaProductos filas={filas} proveedores={proveedores} />
      )}
    </div>
  )
}
