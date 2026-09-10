'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listarGastos } from '@/lib/data/gastos'
import type { Gasto, CategoriaGasto } from '@/types/database'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'

const NOMBRE_CATEGORIA: Record<CategoriaGasto, string> = {
  combustible: 'Combustible',
  servicios: 'Servicios (luz/gas/agua/internet)',
  indumentaria: 'Indumentaria',
  impuestos: 'Impuestos',
  otro: 'Otro',
}

export default function GastosPage() {
  const esAdmin = useEsAdministrador()
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [categoria, setCategoria] = useState<CategoriaGasto | ''>('')

  useEffect(() => {
    if (esAdmin) {
      listarGastos({ categoria: categoria || undefined }).then(setGastos)
    }
  }, [categoria, esAdmin])

  if (esAdmin === null) return <p className="p-8 text-sm text-ink-soft">Cargando…</p>
  if (esAdmin === false) {
    return (
      <p className="p-8 text-sm text-negative">
        Acceso restringido — contactá a un administrador.
      </p>
    )
  }

  const total = gastos.reduce((acc, g) => acc + g.monto, 0)

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
        <p className="text-sm text-ink-soft">
          Total: <span className="mono font-semibold text-ink">${total.toLocaleString('es-AR')}</span>
        </p>
      </div>

      <div className="card rise divide-y divide-line">
        {gastos.map((g) => (
          <div key={g.id} className="flex items-center justify-between px-5 py-3.5 text-sm">
            <span className="text-ink">
              <span className="mono text-ink-faint">{g.fecha}</span> — {g.concepto}
              {g.proveedor && <span className="text-ink-faint"> ({g.proveedor})</span>}
              <span className="chip ml-2">{NOMBRE_CATEGORIA[g.categoria]}</span>
            </span>
            <span className="mono font-semibold text-ink">${g.monto.toLocaleString('es-AR')}</span>
          </div>
        ))}
        {gastos.length === 0 && <p className="px-5 py-6 text-sm text-ink-faint">Sin gastos aún.</p>}
      </div>
    </div>
  )
}
