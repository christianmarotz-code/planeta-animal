'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { listarGastos } from '@/lib/data/gastos'
import { formatearMonto } from '@/lib/calc/factura'
import { etiquetaMes, rangoDelMes } from '@/lib/facturas/meses'
import { totalesPorCategoria } from '@/lib/gastos/meses'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import { SkeletonPage, SkeletonList } from '@/components/Skeleton'
import type { Gasto, CategoriaGasto } from '@/types/database'
import { FilaGasto } from '../../FilaGasto'
import { NOMBRE_CATEGORIA } from '../../categorias'

export default function GastosDelMesPage() {
  const { mes } = useParams<{ mes: string }>()
  const esAdmin = useEsAdministrador()
  const [gastos, setGastos] = useState<Gasto[] | null>(null)
  const [categoria, setCategoria] = useState<CategoriaGasto | ''>('')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    if (!esAdmin) return
    const { desde, hasta } = rangoDelMes(mes)
    listarGastos({ desde, hasta }).then(setGastos)
  }, [mes, esAdmin])

  const porCategoria = useMemo(() => totalesPorCategoria(gastos ?? []), [gastos])

  const visibles = useMemo(() => {
    const term = busqueda.trim().toLowerCase()
    return (gastos ?? []).filter(
      (g) =>
        (!categoria || g.categoria === categoria) &&
        (!term || g.concepto.toLowerCase().includes(term) || g.proveedor?.toLowerCase().includes(term))
    )
  }, [gastos, categoria, busqueda])

  if (esAdmin === null) {
    return (
      <SkeletonPage>
        <SkeletonList filas={8} />
      </SkeletonPage>
    )
  }
  if (esAdmin === false) {
    return <p className="p-8 text-sm text-negative">Acceso restringido — contactá a un administrador.</p>
  }

  const totalMes = (gastos ?? []).reduce((acc, g) => acc + g.monto, 0)
  const totalVisible = visibles.reduce((acc, g) => acc + g.monto, 0)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="rise">
        <Link href="/gastos" className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint hover:text-ink">
          ← Gastos
        </Link>
        <h1 className="mt-1 text-[27px] text-ink">{etiquetaMes(mes)}</h1>
        {gastos && (
          <p className="mt-1 text-sm text-ink-soft">
            {gastos.length} {gastos.length === 1 ? 'gasto' : 'gastos'} ·{' '}
            <span className="mono font-semibold text-ink">{formatearMonto(totalMes)}</span>
          </p>
        )}
      </div>

      {porCategoria.length > 0 && (
        <div className="grid gap-3 rise sm:grid-cols-2 lg:grid-cols-4">
          {porCategoria.map((c) => (
            <button
              key={c.categoria}
              type="button"
              onClick={() => setCategoria(categoria === c.categoria ? '' : c.categoria)}
              className={`card flex flex-col gap-1 p-4 text-left transition hover:border-accent ${categoria === c.categoria ? 'border-accent' : ''}`}
            >
              <span className="text-xs text-ink-soft">{NOMBRE_CATEGORIA[c.categoria]}</span>
              <span className="mono font-semibold text-ink">{formatearMonto(c.total)}</span>
            </button>
          ))}
        </div>
      )}

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
        {(categoria || busqueda.trim()) && (
          <p className="text-sm text-ink-soft">
            Filtrado: <span className="mono font-semibold text-ink">{formatearMonto(totalVisible)}</span>
          </p>
        )}
      </div>

      <div className="card rise divide-y divide-line">
        {gastos === null && <p className="px-5 py-6 text-sm text-ink-soft">Cargando…</p>}
        {gastos && visibles.map((g) => <FilaGasto key={g.id} gasto={g} />)}
        {gastos && visibles.length === 0 && (
          <p className="px-5 py-6 text-sm text-ink-faint">Sin gastos que coincidan.</p>
        )}
      </div>
    </div>
  )
}
