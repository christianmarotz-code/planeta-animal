'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { listarGastos } from '@/lib/data/gastos'
import type { Gasto, CategoriaGasto } from '@/types/database'
import { formatearMonto } from '@/lib/calc/factura'
import { resumirGastosPorMes } from '@/lib/gastos/meses'
import { FilaGasto } from './FilaGasto'
import { NOMBRE_CATEGORIA } from './categorias'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import { SkeletonPage, SkeletonList } from '@/components/Skeleton'

export default function GastosPage() {
  const esAdmin = useEsAdministrador()
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [categoria, setCategoria] = useState<CategoriaGasto | ''>('')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    if (esAdmin) {
      listarGastos({ categoria: categoria || undefined }).then(setGastos)
    }
  }, [categoria, esAdmin])

  const gastosFiltrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase()
    if (!term) return gastos
    return gastos.filter(
      (g) => g.concepto.toLowerCase().includes(term) || g.proveedor?.toLowerCase().includes(term)
    )
  }, [gastos, busqueda])

  if (esAdmin === null) {
    return (
      <SkeletonPage>
        <SkeletonList filas={8} />
      </SkeletonPage>
    )
  }
  if (esAdmin === false) {
    return (
      <p className="p-8 text-sm text-negative">
        Acceso restringido — contactá a un administrador.
      </p>
    )
  }

  const meses = resumirGastosPorMes(gastos)
  const total = gastosFiltrados.reduce((acc, g) => acc + g.monto, 0)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="flex items-center justify-between rise">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Gestión
          </p>
          <h1 className="mt-1 text-[27px] text-ink">Gastos</h1>
        </div>
        <Link href="/gastos/nueva" className="pill-btn">
          + Nuevo gasto
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rise">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Buscar por concepto o proveedor…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full max-w-xs rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent"
          />
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as CategoriaGasto | '')}
            className="w-fit rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
          >
            <option value="">Todas las categorías</option>
            {(Object.keys(NOMBRE_CATEGORIA) as CategoriaGasto[]).map((c) => (
              <option key={c} value={c}>
                {NOMBRE_CATEGORIA[c]}
              </option>
            ))}
          </select>
        </div>
        <p className="text-sm text-ink-soft">
          Total: <span className="mono font-semibold text-ink">{formatearMonto(total)}</span>
        </p>
      </div>

      {busqueda.trim() ? (
        <div className="card rise divide-y divide-line">
          {gastosFiltrados.map((g) => (
            <FilaGasto key={g.id} gasto={g} />
          ))}
          {gastosFiltrados.length === 0 && (
            <p className="px-5 py-6 text-sm text-ink-faint">Sin gastos que coincidan con la búsqueda.</p>
          )}
        </div>
      ) : meses.length === 0 ? (
        <p className="card rise px-5 py-6 text-sm text-ink-faint">Sin gastos aún.</p>
      ) : (
        <div className="grid gap-4 rise sm:grid-cols-2 lg:grid-cols-3">
          {meses.map((m) => (
            <Link
              key={m.mes}
              href={`/gastos/mes/${m.mes}`}
              className="card flex flex-col gap-3 p-5 transition hover:-translate-y-0.5 hover:border-accent"
            >
              <span className="text-[17px] font-semibold text-ink">{m.etiqueta}</span>
              <span className="text-sm text-ink-soft">
                {m.cantidad} {m.cantidad === 1 ? 'gasto' : 'gastos'}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="mono text-lg font-semibold text-ink">{formatearMonto(m.total)}</span>
                {m.variacion !== null && (
                  <span
                    className={`whitespace-nowrap text-[11px] font-medium ${m.variacion >= 0 ? 'text-negative' : 'text-positive'}`}
                    title="Contra el mes anterior (subir es gastar más)"
                  >
                    {m.variacion >= 0 ? '▲' : '▼'} {Math.abs(m.variacion).toFixed(0)} % vs mes anterior
                  </span>
                )}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
