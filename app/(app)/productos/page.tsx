'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { eliminarProducto, listarProductos } from '@/lib/data/productos'
import type { Producto, Rama } from '@/types/database'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import { SkeletonTable } from '@/components/Skeleton'
import {
  aReponer,
  comparador,
  cumpleEstado,
  esStockeable,
  type EstadoStock,
  type OrdenProductos,
} from '@/lib/productos/stock'

const ETIQUETA_RAMA: Record<Rama, string> = { clinica: 'Clínica', petshop: 'Petshop' }
const ORDEN_RAMA = ['clinica', 'petshop']
const SIN_SUBCATEGORIA = 'Sin subcategoría'
const SIN_CLASIFICAR = 'Sin clasificar'
// Con pocos resultados no tiene sentido obligar a abrir grupo por grupo.
const MAX_FILAS_AUTO_ABIERTO = 60
// La vista de lista puede tener miles de filas: se muestran de a tandas.
const TANDA_LISTA = 100
const TOP_RESUMEN = 5

type Vista = 'grupos' | 'lista'

interface Grupo {
  clave: string
  rama: Rama | null
  subcategoria: string
  productos: Producto[]
  aReponer: number
}

interface Aviso {
  tipo: 'ok' | 'error'
  texto: string
}

function ordenRama(rama: Rama | null) {
  const i = rama ? ORDEN_RAMA.indexOf(rama) : -1
  return i === -1 ? ORDEN_RAMA.length : i
}

function esSinClasificar(subcategoria: string) {
  return subcategoria === SIN_CLASIFICAR || subcategoria === SIN_SUBCATEGORIA
}

const TH = 'px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint'
const CONTROL =
  'rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent'

function FilaProducto({
  p,
  esAdmin,
  mostrarSubcategoria,
  confirmando,
  eliminando,
  onPedirConfirmacion,
  onCancelar,
  onEliminar,
}: {
  p: Producto
  esAdmin: boolean
  mostrarSubcategoria: boolean
  confirmando: boolean
  eliminando: boolean
  onPedirConfirmacion: () => void
  onCancelar: () => void
  onEliminar: () => void
}) {
  return (
    <tr className="border-b border-line transition last:border-0 hover:bg-accent/5">
      <td className="px-5 py-3">
        <Link href={`/productos/${p.id}`} className="font-medium text-ink hover:text-accent">
          {p.nombre}
        </Link>
      </td>
      <td className="px-5 py-3 text-ink-soft">
        {mostrarSubcategoria ? (p.subcategoria ?? <span className="text-ink-faint">—</span>) : p.categoria}
      </td>
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
        {esStockeable(p) && p.stock_minimo > 0 && (
          <span className="ml-2 text-xs text-ink-faint">mín. {p.stock_minimo}</span>
        )}
      </td>
      {esAdmin && (
        <>
          <td className="mono px-5 py-3 text-ink">
            ${p.costo_unitario_actual.toLocaleString('es-AR')}
          </td>
          <td className="whitespace-nowrap px-5 py-3 text-right">
            {confirmando ? (
              <span className="flex items-center justify-end gap-3 text-xs">
                <span className="text-ink-soft">
                  ¿Eliminar{p.stock_actual !== 0 ? ` (tiene ${p.stock_actual} en stock)` : ''}?
                </span>
                <button
                  type="button"
                  onClick={onEliminar}
                  disabled={eliminando}
                  className="font-semibold text-negative hover:underline disabled:opacity-50"
                >
                  {eliminando ? 'Eliminando…' : 'Sí, eliminar'}
                </button>
                <button type="button" onClick={onCancelar} className="text-ink-soft hover:text-ink">
                  Cancelar
                </button>
              </span>
            ) : (
              <span className="flex items-center justify-end gap-4 text-sm">
                <Link href={`/productos/${p.id}`} className="text-ink-soft hover:text-accent">
                  Editar
                </Link>
                <button type="button" onClick={onPedirConfirmacion} className="text-ink-soft hover:text-negative">
                  Eliminar
                </button>
              </span>
            )}
          </td>
        </>
      )}
    </tr>
  )
}

export default function ProductosPage() {
  const esAdmin = useEsAdministrador() === true
  const [productos, setProductos] = useState<Producto[]>([])
  const [estado, setEstado] = useState<EstadoStock>('todos')
  const [orden, setOrden] = useState<OrdenProductos>('nombre')
  const [vista, setVista] = useState<Vista>('grupos')
  const [limite, setLimite] = useState(TANDA_LISTA)
  const [rama, setRama] = useState<Rama | ''>('')
  const [categoria, setCategoria] = useState('')
  const [subcategoria, setSubcategoria] = useState('')
  const [busqueda, setBusqueda] = useState('')
  // Apertura manual de grupos. Lo que no está acá sigue la regla automática
  // (abierto si hay filtros activos o pocos resultados). Se reinicia al
  // cambiar cualquier filtro para que la regla automática vuelva a mandar.
  const [manual, setManual] = useState<Record<string, boolean>>({})
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [eliminando, setEliminando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listarProductos()
      .then(setProductos)
      .finally(() => setLoading(false))
  }, [])

  function cambiarFiltro(aplicar: () => void) {
    aplicar()
    setManual({})
    setLimite(TANDA_LISTA)
    setConfirmando(null)
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

  // Resumen de arriba: sale de la rama elegida, sin los demás filtros, para que
  // siempre muestre el panorama completo de esa rama.
  const resumen = useMemo(() => {
    const reponer = enRama.filter(aReponer).sort(comparador('urgente'))
    const masStock = enRama.filter(esStockeable).sort(comparador('mas_stock'))
    const cuenta = (e: EstadoStock) => enRama.filter((p) => cumpleEstado(p, e)).length
    return {
      reponer,
      masStock: masStock.slice(0, TOP_RESUMEN),
      sinStock: cuenta('sin_stock'),
      negativos: cuenta('negativo'),
      conStock: cuenta('con_stock'),
    }
  }, [enRama])

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
      .filter((p) => cumpleEstado(p, estado))
      .filter((p) => (term ? p.nombre.toLowerCase().includes(term) : true))
      .sort(comparador(orden))
  }, [enRama, categoria, subcategoria, estado, busqueda, orden])

  const grupos = useMemo(() => {
    const mapa = new Map<string, Grupo>()
    for (const p of filtrados) {
      const sub = p.subcategoria ?? SIN_SUBCATEGORIA
      const clave = `${p.rama ?? '-'}|${sub}`
      let g = mapa.get(clave)
      if (!g) {
        g = { clave, rama: p.rama, subcategoria: sub, productos: [], aReponer: 0 }
        mapa.set(clave, g)
      }
      g.productos.push(p)
      if (aReponer(p)) g.aReponer++
    }
    return Array.from(mapa.values()).sort(
      (a, b) =>
        ordenRama(a.rama) - ordenRama(b.rama) ||
        Number(esSinClasificar(a.subcategoria)) - Number(esSinClasificar(b.subcategoria)) ||
        a.subcategoria.localeCompare(b.subcategoria)
    )
  }, [filtrados])

  const hayFiltros =
    busqueda.trim() !== '' || categoria !== '' || subcategoria !== '' || estado !== 'todos'
  const abiertoPorDefecto = hayFiltros || filtrados.length <= MAX_FILAS_AUTO_ABIERTO
  const columnas = esAdmin ? 5 : 3

  function estaAbierto(clave: string) {
    return manual[clave] ?? abiertoPorDefecto
  }

  function alternar(clave: string) {
    setManual((m) => ({ ...m, [clave]: !estaAbierto(clave) }))
  }

  function fijarTodos(abierto: boolean) {
    setManual(Object.fromEntries(grupos.map((g) => [g.clave, abierto])))
  }

  // Atajo de las tarjetas de arriba: deja un solo criterio activo y pasa a la
  // lista plana, que es la que sirve para ver un ranking.
  function verSoloEsto(nuevoEstado: EstadoStock, nuevoOrden: OrdenProductos) {
    cambiarFiltro(() => {
      setEstado(nuevoEstado)
      setOrden(nuevoOrden)
      setVista('lista')
      setCategoria('')
      setSubcategoria('')
      setBusqueda('')
    })
  }

  async function eliminar(p: Producto) {
    setEliminando(p.id)
    setAviso(null)
    try {
      const resultado = await eliminarProducto(p.id)
      setProductos((prev) => prev.filter((x) => x.id !== p.id))
      setAviso({
        tipo: 'ok',
        texto:
          resultado === 'eliminado'
            ? `"${p.nombre}" se eliminó.`
            : `"${p.nombre}" tiene historial (compras, stock o ventas), así que se desactivó en lugar de borrarse. Ya no aparece en la lista.`,
      })
    } catch {
      setAviso({ tipo: 'error', texto: `No se pudo eliminar "${p.nombre}". Intentá de nuevo.` })
    } finally {
      setEliminando(null)
      setConfirmando(null)
    }
  }

  const pestanas: { valor: Rama | ''; etiqueta: string; cantidad: number }[] = [
    { valor: '', etiqueta: 'Todas', cantidad: productos.length },
    { valor: 'clinica', etiqueta: ETIQUETA_RAMA.clinica, cantidad: conteoPorRama.clinica },
    { valor: 'petshop', etiqueta: ETIQUETA_RAMA.petshop, cantidad: conteoPorRama.petshop },
  ]

  const propsFila = (p: Producto, mostrarSubcategoria: boolean) => ({
    p,
    esAdmin,
    mostrarSubcategoria,
    confirmando: confirmando === p.id,
    eliminando: eliminando === p.id,
    onPedirConfirmacion: () => setConfirmando(p.id),
    onCancelar: () => setConfirmando(null),
    onEliminar: () => eliminar(p),
  })

  const enLista = filtrados.slice(0, limite)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="flex items-center justify-between rise">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Gestión
          </p>
          <h1 className="mt-1 text-[27px] text-ink">Productos</h1>
          <p className="mt-0.5 text-sm text-ink-faint">
            {filtrados.length} de {productos.length} productos
            {vista === 'grupos' && (
              <>
                {' · '}
                {grupos.length} {grupos.length === 1 ? 'subcategoría' : 'subcategorías'}
              </>
            )}
          </p>
        </div>
        <Link href="/productos/nuevo" className="pill-btn">
          + Nuevo producto
        </Link>
      </div>

      {aviso && (
        <div
          role="status"
          className={`rise flex items-start justify-between gap-3 rounded-[var(--r-sm)] border p-3 text-sm ${
            aviso.tipo === 'ok' ? 'border-line text-ink-soft' : 'border-negative text-negative'
          }`}
        >
          <span>{aviso.texto}</span>
          <button type="button" onClick={() => setAviso(null)} className="text-ink-faint hover:text-ink">
            Cerrar
          </button>
        </div>
      )}

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

      {!loading && (
        <div className="grid gap-4 md:grid-cols-2 rise">
          <section className="card p-5" aria-label="Productos a reponer">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-ink">A reponer</h2>
              <span className="chip down">{resumen.reponer.length}</span>
            </div>
            <p className="mt-0.5 text-xs text-ink-faint">Con stock en su mínimo o por debajo</p>
            {resumen.reponer.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">Nada para reponer por ahora.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-1.5 text-sm">
                {resumen.reponer.slice(0, TOP_RESUMEN).map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-3">
                    <Link href={`/productos/${p.id}`} className="truncate text-ink hover:text-accent">
                      {p.nombre}
                    </Link>
                    <span className="mono shrink-0 text-xs text-ink-soft">
                      {p.stock_actual} / mín. {p.stock_minimo}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
              {resumen.reponer.length > TOP_RESUMEN && (
                <button
                  type="button"
                  onClick={() => verSoloEsto('reponer', 'urgente')}
                  className="font-medium text-accent hover:underline"
                >
                  Ver los {resumen.reponer.length}
                </button>
              )}
              {esAdmin && (
                <Link href="/reposicion" className="text-ink-soft hover:text-accent">
                  Armar pedido de reposición
                </Link>
              )}
            </div>
          </section>

          <section className="card p-5" aria-label="Productos con más stock">
            <h2 className="text-[15px] font-semibold text-ink">Más stock</h2>
            <p className="mt-0.5 text-xs text-ink-faint">Sin contar servicios</p>
            <ul className="mt-3 flex flex-col gap-1.5 text-sm">
              {resumen.masStock.map((p) => (
                <li key={p.id} className="flex items-baseline justify-between gap-3">
                  <Link href={`/productos/${p.id}`} className="truncate text-ink hover:text-accent">
                    {p.nombre}
                  </Link>
                  <span className="mono shrink-0 text-xs text-ink-soft">
                    {p.stock_actual} {p.unidad_stock}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
              <button
                type="button"
                onClick={() => verSoloEsto('con_stock', 'mas_stock')}
                className="font-medium text-accent hover:underline"
              >
                Ver ranking completo
              </button>
              <button
                type="button"
                onClick={() => verSoloEsto('sin_stock', 'nombre')}
                className="text-ink-soft hover:text-accent"
              >
                Sin stock ({resumen.sinStock})
              </button>
              {resumen.negativos > 0 && (
                <button
                  type="button"
                  onClick={() => verSoloEsto('negativo', 'menos_stock')}
                  className="text-ink-soft hover:text-negative"
                >
                  Stock negativo ({resumen.negativos})
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rise">
        <input
          type="text"
          placeholder="Buscar por nombre…"
          value={busqueda}
          onChange={(e) => cambiarFiltro(() => setBusqueda(e.target.value))}
          className={`w-full max-w-xs ${CONTROL}`}
        />
        <select
          aria-label="Categoría"
          value={categoria}
          onChange={(e) =>
            cambiarFiltro(() => {
              setCategoria(e.target.value)
              setSubcategoria('')
            })
          }
          className={CONTROL}
        >
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          aria-label="Subcategoría"
          value={subcategoria}
          onChange={(e) => cambiarFiltro(() => setSubcategoria(e.target.value))}
          className={`max-w-[16rem] ${CONTROL}`}
        >
          <option value="">Todas las subcategorías</option>
          {subcategorias.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          aria-label="Estado de stock"
          value={estado}
          onChange={(e) => cambiarFiltro(() => setEstado(e.target.value as EstadoStock))}
          className={CONTROL}
        >
          <option value="todos">Todos los estados</option>
          <option value="reponer">A reponer ({resumen.reponer.length})</option>
          <option value="sin_stock">Sin stock ({resumen.sinStock})</option>
          <option value="negativo">Stock negativo ({resumen.negativos})</option>
          <option value="con_stock">Con stock ({resumen.conStock})</option>
        </select>
        <select
          aria-label="Ordenar por"
          value={orden}
          onChange={(e) =>
            cambiarFiltro(() => {
              const nuevo = e.target.value as OrdenProductos
              setOrden(nuevo)
              // Un ranking por stock o costo no tiene sentido dentro de cada
              // grupo: se pasa a la lista plana.
              if (nuevo !== 'nombre') setVista('lista')
            })
          }
          className={CONTROL}
        >
          <option value="nombre">Ordenar: nombre (A–Z)</option>
          <option value="mas_stock">Ordenar: más stock primero</option>
          <option value="menos_stock">Ordenar: menos stock primero</option>
          <option value="urgente">Ordenar: más urgente a reponer</option>
          {esAdmin && <option value="mayor_costo">Ordenar: mayor costo</option>}
          {esAdmin && <option value="menor_costo">Ordenar: menor costo</option>}
        </select>
        <div role="group" aria-label="Vista" className="flex overflow-hidden rounded-[var(--r-sm)] border border-line text-sm">
          {(['grupos', 'lista'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={vista === v}
              onClick={() => cambiarFiltro(() => setVista(v))}
              className={`px-3 py-2 transition ${
                vista === v ? 'bg-accent/15 font-medium text-ink' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {v === 'grupos' ? 'Agrupada' : 'Lista'}
            </button>
          ))}
        </div>
        {vista === 'grupos' && grupos.length > 1 && (
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
                <th className={TH}>Nombre</th>
                <th className={TH}>{vista === 'lista' ? 'Subcategoría' : 'Categoría'}</th>
                <th className={TH}>Stock actual</th>
                {esAdmin && <th className={TH}>Costo unitario</th>}
                {esAdmin && <th className={`${TH} text-right`}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {vista === 'lista' &&
                enLista.map((p) => <FilaProducto key={p.id} {...propsFila(p, true)} />)}
              {vista === 'grupos' &&
                grupos.map((g) => {
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
                            {g.aReponer > 0 && <span className="chip down">{g.aReponer} a reponer</span>}
                          </button>
                        </td>
                      </tr>
                      {abierto &&
                        g.productos.map((p) => <FilaProducto key={p.id} {...propsFila(p, false)} />)}
                    </Fragment>
                  )
                })}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={columnas} className="px-5 py-6 text-sm text-ink-faint">
                    Sin productos que coincidan con el filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {vista === 'lista' && filtrados.length > limite && (
            <div className="border-t border-line p-4 text-center">
              <button
                type="button"
                onClick={() => setLimite((l) => l + TANDA_LISTA)}
                className="text-sm font-medium text-accent hover:underline"
              >
                Mostrar {Math.min(TANDA_LISTA, filtrados.length - limite)} más (quedan{' '}
                {filtrados.length - limite})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
