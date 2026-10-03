'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { listarProductos } from '@/lib/data/productos'
import { listarMovimientosStock } from '@/lib/data/movimientos'
import { formatearMonto } from '@/lib/calc/factura'
import { aReponer } from '@/lib/productos/stock'
import {
  SIN_SUBCATEGORIA,
  etiquetaRama,
  productosDelSector,
  ramaDeParam,
} from '@/lib/productos/sectores'
import { HistorialMovimientos } from '../../HistorialMovimientos'
import { TablaStock } from '../../TablaStock'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import type { MovimientoStock, Producto } from '@/types/database'

export default function StockDelSectorPage() {
  const { rama, sector } = useParams<{ rama: string; sector: string }>()
  const esAdmin = useEsAdministrador() === true
  const [productos, setProductos] = useState<Producto[] | null>(null)
  const [movimientos, setMovimientos] = useState<MovimientoStock[]>([])
  const [busqueda, setBusqueda] = useState('')

  function cargar() {
    listarProductos().then(setProductos)
    listarMovimientosStock().then(setMovimientos)
  }

  useEffect(cargar, [])

  // La rama viene de la URL y cualquiera puede escribir una a mano.
  const ramaValida = ramaDeParam(rama) !== undefined

  const lista = useMemo(
    () => (productos && ramaValida ? productosDelSector(productos, rama, sector) : null),
    [productos, ramaValida, rama, sector]
  )

  const resumen = useMemo(() => {
    const l = lista ?? []
    return {
      aReponer: l.filter(aReponer).length,
      sinStock: l.filter((p) => p.stock_actual <= 0).length,
      valor: l.reduce((acc, p) => acc + Math.max(p.stock_actual, 0) * p.costo_unitario_actual, 0),
    }
  }, [lista])

  const visibles = useMemo(() => {
    const term = busqueda.trim().toLowerCase()
    if (!lista) return []
    return term ? lista.filter((p) => p.nombre.toLowerCase().includes(term)) : lista
  }, [lista, busqueda])

  const movimientosDelSector = useMemo(() => {
    const ids = new Set((lista ?? []).map((p) => p.id))
    return movimientos.filter((m) => ids.has(m.producto_id))
  }, [lista, movimientos])

  const noExiste = !ramaValida || (lista !== null && lista.length === 0)
  const titulo = lista?.[0]?.subcategoria ?? SIN_SUBCATEGORIA

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3 rise">
        <div>
          <Link
            href="/stock"
            className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint hover:text-ink"
          >
            ← Stock
          </Link>
          {noExiste ? (
            <h1 className="mt-1 text-[27px] text-ink">Sector no encontrado</h1>
          ) : (
            <>
              <p className="mt-1 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                {ramaValida ? etiquetaRama(ramaDeParam(rama) ?? null) : ''}
              </p>
              <h1 className="mt-1 text-[27px] text-ink">{lista ? titulo : 'Cargando…'}</h1>
              {lista && (
                <p className="mt-1 text-sm text-ink-soft">
                  {lista.length} {lista.length === 1 ? 'producto' : 'productos'} · {resumen.sinStock} sin stock
                  {resumen.aReponer > 0 && <> · {resumen.aReponer} a reponer</>}
                  {esAdmin && (
                    <>
                      {' '}
                      · <span className="mono font-semibold text-ink">{formatearMonto(resumen.valor)}</span>
                    </>
                  )}
                </p>
              )}
            </>
          )}
        </div>
        {!noExiste && (
          <input
            type="text"
            placeholder="Buscar en este sector…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full max-w-xs rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent"
          />
        )}
      </div>

      {noExiste ? (
        <p className="card rise px-5 py-6 text-sm text-ink-faint">
          No hay productos en este sector. Volvé a <Link href="/stock" className="text-accent hover:underline">Stock</Link> y
          elegí uno de la lista.
        </p>
      ) : lista === null ? (
        <p className="card rise px-5 py-6 text-sm text-ink-soft">Cargando…</p>
      ) : (
        <>
          <TablaStock
            productos={visibles}
            esAdmin={esAdmin}
            onAjustado={cargar}
            textoVacio="Sin productos que coincidan con la búsqueda."
          />
          <HistorialMovimientos
            movimientos={movimientosDelSector}
            productos={lista}
            titulo="Movimientos de este sector"
          />
        </>
      )}
    </div>
  )
}
