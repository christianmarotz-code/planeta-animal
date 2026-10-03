'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { listarProductos } from '@/lib/data/productos'
import type { Producto, Rama } from '@/types/database'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import { SkeletonTable } from '@/components/Skeleton'

const ETIQUETA_RAMA: Record<Rama, string> = { clinica: 'Clínica', petshop: 'Petshop' }
const ORDEN_RAMA = ['clinica', 'petshop']
const SIN_SUBCATEGORIA = 'Sin subcategoría'
const SIN_CLASIFICAR = 'Sin clasificar'
// Con pocos resultados no tiene sentido obligar a abrir grupo por grupo.
const MAX_FILAS_AUTO_ABIERTO = 60

interface Grupo {
  clave: string
  rama: Rama | null
  subcategoria: string
  productos: Producto[]
  bajos: number
}

function ordenRama(rama: Rama | null) {
  const i = rama ? ORDEN_RAMA.indexOf(rama) : -1
  return i === -1 ? ORDEN_RAMA.length : i
}

function esSinClasificar(subcategoria: string) {
  return subcategoria === SIN_CLASIFICAR || subcategoria === SIN_SUBCATEGORIA
}

export default function ProductosPage() {
  const esAdmin = useEsAdministrador()
  const [productos, setProductos] = useState<Producto[]>([])
  const [soloStockBajo, setSoloStockBajo] = useState(false)
  const [soloConStock, setSoloConStock] = useState(false)
  const [rama, setRama] = useState<Rama | ''>('')
  const [categoria, setCategoria] = useState('')
  const [subcategoria, setSubcategoria] = useState('')
  const [busqueda, setBusqueda] = useState('')
  // Apertura manual de grupos. Lo que no está acá sigue la regla automática
  // (abierto si hay filtros activos o pocos resultados). Se reinicia al
  // cambiar cualquier filtro para que la regla automática vuelva a mandar.
  const [manual, setManual] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [soloStockBajoCargado, setSoloStockBajoCargado] = useState(soloStockBajo)

  if (soloStockBajoCargado !== soloStockBajo) {
    setSoloStockBajoCargado(soloStockBajo)
    setLoading(true)
  }

  useEffect(() => {
    listarProductos({ soloStockBajo })
      .then(setProductos)
      .finally(() => setLoading(false))
  }, [soloStockBajo])

  function cambiarFiltro(aplicar: () => void) {
    aplicar()
    setManual({})
  }

  const conteoPorRama = useMemo(() => {
    const c: Record<string, number> = { clinica: 0, petshop: 0 }
    for (const p of productos) if (p.rama) c[p.rama]++
    return c
  }, [productos])

  const enRama = useMemo(
    () => productos.filter((p) => (rama ? p.rama === rama : true)),
    [productos, rama]
  )

  const categorias = useMemo(
    () => Array.from(new Set(enRama.map((p) => p.categoria).filter(Boolean))).sort() as string[],
    [enRama]
  )

  // Las subcategorías ofrecidas dependen de la rama y la categoría elegidas,
  // para no listar opciones que darían cero resultados.
  const subcategorias = useMemo(
    () =>
      Array.from(
        new Set(
          enRama
            .filter((p) => (categoria ? p.categoria === categoria : true))
            .map((p) => p.subcategoria)
            .filter(Boolean)
        )
      ).sort() as string[],
    [enRama, categoria]
  )

  const filtrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase()
    return enRama
      .filter((p) => (categoria ? p.categoria === categoria : true))
      .filter((p) => (subcategoria ? p.subcategoria === subcategoria : true))
      .filter((p) => (soloConStock ? p.stock_actual > 0 : true))
      .filter((p) => (term ? p.nombre.toLowerCase().includes(term) : true))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [enRama, categoria, subcategoria, soloConStock, busqueda])

  const grupos = useMemo(() => {
    const mapa = new Map<string, Grupo>()
    for (const p of filtrados) {
      const sub = p.subcategoria ?? SIN_SUBCATEGORIA
      const clave = `${p.rama ?? '-'}|${sub}`
      let g = mapa.get(clave)
      if (!g) {
        g = { clave, rama: p.rama, subcategoria: sub, productos: [], bajos: 0 }
        mapa.set(clave, g)
      }
      g.productos.push(p)
      if (p.stock_actual <= p.stock_minimo) g.bajos++
    }
    return Array.from(mapa.values()).sort(
      (a, b) =>
        ordenRama(a.rama) - ordenRama(b.rama) ||
        Number(esSinClasificar(a.subcategoria)) - Number(esSinClasificar(b.subcategoria)) ||
        a.subcategoria.localeCompare(b.subcategoria)
    )
  }, [filtrados])

  const hayFiltros = busqueda.trim() !== '' || categoria !== '' || subcategoria !== ''
  const abiertoPorDefecto = hayFiltros || filtrados.length <= MAX_FILAS_AUTO_ABIERTO
  const columnas = esAdmin ? 4 : 3

  function estaAbierto(clave: string) {
    return manual[clave] ?? abiertoPorDefecto
  }

  function alternar(clave: string) {
    setManual((m) => ({ ...m, [clave]: !estaAbierto(clave) }))
  }

  function fijarTodos(abierto: boolean) {
    setManual(Object.fromEntries(grupos.map((g) => [g.clave, abierto])))
  }

  const pestanas: { valor: Rama | ''; etiqueta: string; cantidad: number }[] = [
    { valor: '', etiqueta: 'Todas', cantidad: productos.length },
    { valor: 'clinica', etiqueta: ETIQUETA_RAMA.clinica, cantidad: conteoPorRama.clinica },
    { valor: 'petshop', etiqueta: ETIQUETA_RAMA.petshop, cantidad: conteoPorRama.petshop },
  ]

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="flex items-center justify-between rise">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Gestión
          </p>
          <h1 className="mt-1 text-[27px] text-ink">Productos</h1>
          <p className="mt-0.5 text-sm text-ink-faint">
            {filtrados.length} de {productos.length} productos · {grupos.length}{' '}
            {grupos.length === 1 ? 'subcategoría' : 'subcategorías'}
          </p>
        </div>
        <Link href="/productos/nuevo" className="pill-btn">
          + Nuevo producto
        </Link>
      </div>
      <div role="tablist" aria-label="Rama" className="flex flex-wrap gap-2 rise">
        {pestanas.map((t) => {
          const activa = rama === t.valor
          return (
            <button
              key={t.valor || 'todas'}
              type="button"
              role="tab"
              aria-selected={activa}
              onClick={() =>
                cambiarFiltro(() => {
                  setRama(t.valor)
                  setCategoria('')
                  setSubcategoria('')
                })
              }
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                activa
                  ? 'border-accent bg-accent/15 text-ink'
                  : 'border-line text-ink-soft hover:border-accent'
              }`}
            >
              {t.etiqueta} <span className="text-ink-faint">{t.cantidad}</span>
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3 rise">
        <input
          type="text"
          placeholder="Buscar por nombre…"
          value={busqueda}
          onChange={(e) => cambiarFiltro(() => setBusqueda(e.target.value))}
          className="w-full max-w-xs rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        />
        <select
          value={categoria}
          onChange={(e) =>
            cambiarFiltro(() => {
              setCategoria(e.target.value)
              setSubcategoria('')
            })
          }
          className="rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        >
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={subcategoria}
          onChange={(e) => cambiarFiltro(() => setSubcategoria(e.target.value))}
          className="max-w-[16rem] rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        >
          <option value="">Todas las subcategorías</option>
          {subcategorias.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={soloConStock}
            onChange={(e) => cambiarFiltro(() => setSoloConStock(e.target.checked))}
            className="accent-accent"
          />
          Solo con stock
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={soloStockBajo}
            onChange={(e) => cambiarFiltro(() => setSoloStockBajo(e.target.checked))}
            className="accent-accent"
          />
          Mostrar solo stock bajo
        </label>
        {grupos.length > 1 && (
          <span className="ml-auto flex gap-3 text-sm">
            <button type="button" onClick={() => fijarTodos(true)} className="text-ink-soft hover:text-accent">
              Expandir todo
            </button>
            <button type="button" onClick={() => fijarTodos(false)} className="text-ink-soft hover:text-accent">
              Contraer todo
            </button>
          </span>
        )}
      </div>
      {loading ? (
        <SkeletonTable filas={8} columnas={columnas} />
      ) : (
        <div className="card rise overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-line-strong text-left">
                <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  Nombre
                </th>
                <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  Categoría
                </th>
                <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  Stock actual
                </th>
                {esAdmin && (
                  <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Costo unitario
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => {
                const abierto = estaAbierto(g.clave)
                return (
                  <Fragment key={g.clave}>
                    <tr className="border-b border-line bg-surface-sunk">
                      <td colSpan={columnas} className="p-0">
                        <button
                          type="button"
                          aria-expanded={abierto}
                          onClick={() => alternar(g.clave)}
                          className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-accent/5"
                        >
                          <span className="w-3 text-ink-faint" aria-hidden>
                            {abierto ? '▾' : '▸'}
                          </span>
                          <span className="text-[13px] font-semibold text-ink">{g.subcategoria}</span>
                          {rama === '' && g.rama && <span className="chip">{ETIQUETA_RAMA[g.rama]}</span>}
                          <span className="text-xs text-ink-faint">
                            {g.productos.length} {g.productos.length === 1 ? 'producto' : 'productos'}
                          </span>
                          {g.bajos > 0 && <span className="chip down">{g.bajos} con stock bajo</span>}
                        </button>
                      </td>
                    </tr>
                    {abierto &&
                      g.productos.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-line transition last:border-0 hover:bg-accent/5"
                        >
                          <td className="px-5 py-3">
                            <Link href={`/productos/${p.id}`} className="font-medium text-ink hover:text-accent">
                              {p.nombre}
                            </Link>
                          </td>
                          <td className="px-5 py-3 text-ink-soft">{p.categoria}</td>
                          <td className="px-5 py-3">
                            {p.stock_actual <= p.stock_minimo ? (
                              <span className="chip down">
                                {p.stock_actual} {p.unidad_stock}
                              </span>
                            ) : (
                              <span className="mono text-ink">
                                {p.stock_actual} {p.unidad_stock}
                              </span>
                            )}
                          </td>
                          {esAdmin && (
                            <td className="mono px-5 py-3 text-ink">
                              ${p.costo_unitario_actual.toLocaleString('es-AR')}
                            </td>
                          )}
                        </tr>
                      ))}
                  </Fragment>
                )
              })}
              {grupos.length === 0 && (
                <tr>
                  <td colSpan={columnas} className="px-5 py-6 text-sm text-ink-faint">
                    Sin productos que coincidan con el filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
