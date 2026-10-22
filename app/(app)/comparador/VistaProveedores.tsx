'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { FilaComparador } from '@/lib/data/preciosProveedor'
import type { Proveedor } from '@/types/database'
import { resumirProveedores } from '@/lib/comparador/vistas'
import { formatearFechaCorta } from '@/lib/facturas/meses'
import { INPUT_CLASS } from './estilos'

export function VistaProveedores({ filas, proveedores }: { filas: FilaComparador[]; proveedores: Proveedor[] }) {
  const [busqueda, setBusqueda] = useState('')

  const resumenes = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    return resumirProveedores(filas, proveedores).filter(
      (r) => !termino || r.proveedor.nombre.toLowerCase().includes(termino)
    )
  }, [filas, proveedores, busqueda])

  return (
    <div className="flex flex-col gap-4">
      <input
        type="text"
        placeholder="Buscar proveedor…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className={`${INPUT_CLASS} w-full max-w-xs`}
      />
      {resumenes.length === 0 ? (
        <p className="card px-5 py-6 text-sm text-ink-faint">No hay proveedores que coincidan.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resumenes.map((r) => (
            <Link
              key={r.proveedor.id}
              href={`/comparador/proveedor/${r.proveedor.id}`}
              className="card flex flex-col gap-2 p-5 transition hover:-translate-y-0.5 hover:border-accent"
            >
              <span className="text-[17px] font-semibold text-ink">{r.proveedor.nombre}</span>
              {r.cantidadPrecios === 0 ? (
                <>
                  <span className="text-sm text-ink-soft">Sin precios todavía</span>
                  <span className="text-sm font-semibold text-accent">Cargar precios →</span>
                </>
              ) : (
                <>
                  <span className="text-sm text-ink-soft">
                    {r.cantidadPrecios} {r.cantidadPrecios === 1 ? 'producto con precio' : 'productos con precio'}
                  </span>
                  {r.ultimaActualizacion && (
                    <span className="text-sm text-ink-faint">
                      Actualizado {formatearFechaCorta(r.ultimaActualizacion.slice(0, 10))}
                    </span>
                  )}
                  {r.cantidadMasBarato > 0 && (
                    <span className="chip up w-fit">Más barato en {r.cantidadMasBarato}</span>
                  )}
                </>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
