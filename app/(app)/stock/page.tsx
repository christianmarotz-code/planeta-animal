'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { listarProductos } from '@/lib/data/productos'
import { listarMovimientosStock } from '@/lib/data/movimientos'
import { formatearMonto } from '@/lib/calc/factura'
import { esStockeable } from '@/lib/productos/stock'
import { etiquetaRama, resumirPorSector } from '@/lib/productos/sectores'
import { EntradasPendientes } from './EntradasPendientes'
import { HistorialMovimientos } from './HistorialMovimientos'
import { TablaStock } from './TablaStock'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import type { MovimientoStock, Producto, Rama } from '@/types/database'

export default function StockPage() {
  const esAdmin = useEsAdministrador() === true
  const [productos, setProductos] = useState<Producto[] | null>(null)
  const [movimientos, setMovimientos] = useState<MovimientoStock[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [rama, setRama] = useState<Rama | ''>('')

  function cargar() {
    listarProductos().then(setProductos)
    listarMovimientosStock().then(setMovimientos)
  }

  useEffect(cargar, [])

  const enRama = useMemo(
    () => (productos ?? []).filter((p) => (rama ? p.rama === rama : true)),
    [productos, rama]
  )

  const sectores = useMemo(() => resumirPorSector(enRama), [enRama])

  // La búsqueda mira solo mercadería, igual que las tarjetas: los servicios
  // tienen stock de relleno y no corresponden a esta vista.
  const resultados = useMemo(() => {
    const term = busqueda.trim().toLowerCase()
    if (!term) return []
    return enRama
      .filter((p) => esStockeable(p) && p.nombre.toLowerCase().includes(term))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [enRama, busqueda])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="rise flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Gestión</p>
          <h1 className="mt-1 text-[27px] text-ink">Stock</h1>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {esAdmin && (
            <Link
              href="/reposicion"
              className="rounded-full border border-line px-4 py-2 font-medium text-ink transition hover:border-accent"
            >
              A reponer
            </Link>
          )}
          <Link
            href="/productos"
            className="rounded-full border border-line px-4 py-2 font-medium text-ink transition hover:border-accent"
          >
            Catálogo de productos
          </Link>
          <Link
            href="/productos/nuevo"
            className="rounded-full bg-accent px-4 py-2 font-medium text-accent-ink transition hover:opacity-90"
          >
            Nuevo producto
          </Link>
        </div>
      </div>
      <EntradasPendientes productos={productos ?? []} onConfirmada={cargar} />
      <div className="flex flex-wrap items-center gap-3 rise">
        <input
          type="text"
          placeholder="Buscar producto por nombre…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full max-w-xs rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        />
        <select
          aria-label="Rama"
          value={rama}
          onChange={(e) => setRama(e.target.value as Rama | '')}
          className="w-fit rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        >
          <option value="">Todas las ramas</option>
          <option value="clinica">Clínica</option>
          <option value="petshop">Petshop</option>
        </select>
      </div>
      {busqueda.trim() ? (
        <TablaStock
          productos={resultados}
          esAdmin={esAdmin}
          onAjustado={cargar}
          mostrarSector
          textoVacio="Sin productos que coincidan con la búsqueda."
        />
      ) : productos === null ? (
        <p className="card rise px-5 py-6 text-sm text-ink-soft">Cargando…</p>
      ) : sectores.length === 0 ? (
        <p className="card rise px-5 py-6 text-sm text-ink-faint">Sin productos aún.</p>
      ) : (
        <div className="grid gap-4 rise sm:grid-cols-2 lg:grid-cols-3">
          {sectores.map((s) => (
            <Link
              key={`${s.ramaParam}/${s.slug}`}
              href={`/stock/${s.ramaParam}/${s.slug}`}
              className="card flex flex-col gap-3 p-5 transition hover:-translate-y-0.5 hover:border-accent"
            >
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                {etiquetaRama(s.rama)}
              </span>
              <span className="text-[17px] font-semibold text-ink">{s.subcategoria}</span>
              <span className="text-sm text-ink-soft">
                {s.productos} {s.productos === 1 ? 'producto' : 'productos'} · {s.sinStock} sin stock
              </span>
              {s.aReponer > 0 && <span className="chip down w-fit">{s.aReponer} a reponer</span>}
              {esAdmin && <span className="mono text-lg font-semibold text-ink">{formatearMonto(s.valor)}</span>}
            </Link>
          ))}
        </div>
      )}

      <HistorialMovimientos movimientos={movimientos} productos={productos ?? []} />
    </div>
  )
}
