'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { FilaComparador } from '@/lib/data/preciosProveedor'
import type { Proveedor } from '@/types/database'
import { buscarProductos, esPrecioViejo, rankingDeProducto } from '@/lib/comparador/vistas'
import { formatearFechaCorta } from '@/lib/facturas/meses'
import { INPUT_CLASS } from './estilos'

export function VistaProductos({ filas, proveedores }: { filas: FilaComparador[]; proveedores: Proveedor[] }) {
  const [busqueda, setBusqueda] = useState('')
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set())
  const [hoy] = useState(() => new Date())

  const proveedoresConPrecios = useMemo(
    () => proveedores.filter((p) => p.activo && filas.some((f) => f.precios.some((x) => x.proveedor.id === p.id))),
    [proveedores, filas]
  )
  const permitidos = useMemo(
    () => new Set(proveedoresConPrecios.filter((p) => !excluidos.has(p.id)).map((p) => p.id)),
    [proveedoresConPrecios, excluidos]
  )
  const resultados = useMemo(() => buscarProductos(filas, busqueda), [filas, busqueda])

  function alternar(id: string) {
    setExcluidos((previo) => {
      const siguiente = new Set(previo)
      if (siguiente.has(id)) siguiente.delete(id)
      else siguiente.add(id)
      return siguiente
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        type="text"
        placeholder="Buscar producto…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className={`${INPUT_CLASS} w-full max-w-xs`}
      />

      {proveedoresConPrecios.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-faint">Comparar con:</span>
          {proveedoresConPrecios.map((p) => {
            const activo = !excluidos.has(p.id)
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={activo}
                onClick={() => alternar(p.id)}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  activo ? 'border-accent text-ink' : 'border-line text-ink-faint line-through'
                }`}
              >
                {p.nombre}
              </button>
            )
          })}
        </div>
      )}

      {busqueda.trim() === '' ? (
        <p className="card px-5 py-6 text-sm text-ink-faint">
          Escribí el nombre de un producto para ver quién lo vende más barato.
        </p>
      ) : resultados.length === 0 ? (
        <p className="card px-5 py-6 text-sm text-ink-faint">
          Ningún producto con precio cargado coincide con la búsqueda.
        </p>
      ) : (
        resultados.map((fila) => {
          const ranking = rankingDeProducto(fila, permitidos)
          return (
            <div key={fila.producto.id} className="card flex flex-col gap-2 p-5">
              <p className="text-[15px] font-semibold text-ink">{fila.producto.nombre}</p>
              {ranking.length === 0 ? (
                <p className="text-sm text-ink-faint">
                  Ninguno de los proveedores elegidos tiene precio para este producto.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {ranking.map((pos, i) => (
                    <div
                      key={pos.precioId}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-sm)] px-3 py-2 text-sm ${
                        i === 0 ? 'bg-positive-soft text-positive' : 'border border-line text-ink'
                      }`}
                    >
                      <span className="flex flex-col">
                        <Link href={`/comparador/proveedor/${pos.proveedor.id}`} className="font-medium hover:underline">
                          {i + 1}.º {pos.proveedor.nombre}
                        </Link>
                        {pos.nota && <span className="text-xs opacity-80">{pos.nota}</span>}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className={esPrecioViejo(pos.actualizadoEn, hoy) ? 'text-xs text-negative' : 'text-xs text-ink-faint'}>
                          {formatearFechaCorta(pos.actualizadoEn.slice(0, 10))}
                        </span>
                        <span className="mono font-semibold">${pos.precio.toLocaleString('es-AR')}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
