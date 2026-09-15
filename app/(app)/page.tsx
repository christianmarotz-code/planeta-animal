'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listarFacturas, listarItemsFactura } from '@/lib/data/facturas'
import { listarProveedores } from '@/lib/data/proveedores'
import { listarProductos } from '@/lib/data/productos'
import { listarMovimientosStock } from '@/lib/data/movimientos'
import { listarUsuarios, type UsuarioConEmail } from '@/lib/data/usuarios'
import { listarVentas } from '@/lib/data/ventas'
import {
  calcularValorStock,
  calcularGastoPorSemana,
  calcularGastoPorMes,
  calcularCapitalEnRiesgoPorRama,
  calcularGastoPorProveedorPorRama,
  calcularComprobantesPorRama,
  calcularIngresoPorSemana,
  RAMAS,
} from '@/lib/data/reportes'
import { obtenerOCrearPerfilActual } from '@/lib/data/perfiles'
import { HeroStatCard } from '@/components/HeroStatCard'
import { SkeletonPage, SkeletonStatCards, SkeletonTable } from '@/components/Skeleton'
import type {
  FacturaCompra,
  Proveedor,
  Producto,
  Perfil,
  ItemFactura,
  MovimientoStock,
  Rama,
  Venta,
} from '@/types/database'

const NOMBRE_RAMA: Record<Rama, string> = { clinica: 'Clínica', petshop: 'Petshop' }
const NOMBRE_TIPO_MOVIMIENTO: Record<MovimientoStock['tipo'], string> = {
  entrada_compra: 'Entrada por compra',
  ajuste_manual: 'Ajuste manual',
  salida_venta: 'Salida por venta',
}

function StatShell({
  eyebrow,
  value,
  delta,
  href,
  children,
}: {
  eyebrow: string
  value: string
  delta?: { texto: string; positivo: boolean }
  href?: string
  children?: React.ReactNode
}) {
  const contenido = (
    <div className="glass-core flex h-full flex-col justify-between gap-4">
      <div className="flex items-start justify-between gap-3">
        <p className="line-clamp-2 min-w-0 flex-1 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-white/60 transition-colors group-hover:text-accent">
          {eyebrow}
        </p>
        {delta && (
          <span className={`chip chip-on-glass ${delta.positivo ? 'up' : 'down'}`}>
            {delta.positivo ? '↑' : '↓'} {delta.texto}
          </span>
        )}
      </div>
      <p className="mono text-[27px] font-medium leading-none text-white">{value}</p>
      {children}
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="glass-shell group rise block no-underline">
        {contenido}
      </Link>
    )
  }

  return <div className="glass-shell rise">{contenido}</div>
}

function SeccionRama({
  rama,
  productos,
  facturasUltimos30,
  items,
  proveedores,
  movimientos,
  usuarios,
}: {
  rama: Rama
  productos: Producto[]
  facturasUltimos30: FacturaCompra[]
  items: ItemFactura[]
  proveedores: Proveedor[]
  movimientos: MovimientoStock[]
  usuarios: UsuarioConEmail[]
}) {
  const productosPorId = new Map(productos.map((p) => [p.id, p]))
  const capital = calcularCapitalEnRiesgoPorRama(productos)[rama]
  const topProveedores = calcularGastoPorProveedorPorRama(
    items,
    facturasUltimos30,
    productos,
    proveedores,
    rama
  ).slice(0, 3)
  const comprobantes = calcularComprobantesPorRama(items, facturasUltimos30, productos, rama)
  const usuariosPorId = new Map(usuarios.map((u) => [u.id, u.nombre]))
  const actividad = movimientos
    .filter((m) => productosPorId.get(m.producto_id)?.rama === rama)
    .slice(0, 5)

  return (
    <div className="glass-shell rise">
      <div className="glass-core flex flex-col gap-5">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-white/60">
          {NOMBRE_RAMA[rama]}
        </p>

        <Link
          href="/stock"
          className="group -mx-1 flex flex-col gap-1 rounded-2xl px-1 py-1 no-underline transition-colors hover:bg-white/5"
        >
          <div className="flex items-start justify-between">
            <p className="text-xs text-white/60 transition-colors group-hover:text-accent">
              Capital en riesgo (stock bajo mínimo)
            </p>
            <span className="chip chip-on-glass down">{capital.cantidad} prod.</span>
          </div>
          <p className="mono text-xl font-medium text-white">
            ${capital.valor.toLocaleString('es-AR')}
          </p>
        </Link>

        <div>
          <p className="mb-2 text-xs text-white/60">Top proveedores (30 días, neto)</p>
          <ul className="divide-y divide-white/10">
            {topProveedores.map((p) => {
              const proveedor = proveedores.find((pr) => pr.nombre === p.proveedor)
              const fila = (
                <div className="flex items-center justify-between py-2 text-sm">
                  <span className="text-white">{p.proveedor}</span>
                  <span className="mono text-white/70">${p.total.toLocaleString('es-AR')}</span>
                </div>
              )
              return (
                <li key={p.proveedor}>
                  {proveedor ? (
                    <Link
                      href={`/proveedores/${proveedor.id}`}
                      className="-mx-1 block rounded-lg px-1 no-underline transition-colors hover:bg-white/5"
                    >
                      {fila}
                    </Link>
                  ) : (
                    fila
                  )}
                </li>
              )
            })}
            {topProveedores.length === 0 && (
              <li className="py-2 text-sm text-white/60">Sin compras en los últimos 30 días.</li>
            )}
          </ul>
        </div>

        <div>
          <p className="mb-2 text-xs text-white/60">Comprobantes (30 días)</p>
          <ul className="divide-y divide-white/10">
            {comprobantes.map((c) => (
              <li key={c.tipo} className="flex items-center justify-between py-2 text-sm">
                <span className="text-white">
                  {c.tipo} <span className="text-white/60">({c.cantidad})</span>
                </span>
                <span className="mono text-white/70">${c.total.toLocaleString('es-AR')}</span>
              </li>
            ))}
            {comprobantes.length === 0 && (
              <li className="py-2 text-sm text-white/60">Sin comprobantes en los últimos 30 días.</li>
            )}
          </ul>
        </div>

        <div>
          <p className="mb-2 text-xs text-white/60">Actividad reciente</p>
          <ul className="divide-y divide-white/10">
            {actividad.map((m) => {
              const producto = productosPorId.get(m.producto_id)
              const contenido = (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-white">{producto?.nombre ?? '—'}</span>
                    <span className="mono text-white/70">
                      {m.tipo === 'ajuste_manual' && m.cantidad > 0 ? '+' : ''}
                      {m.cantidad}
                    </span>
                  </div>
                  <p className="mono text-[11px] text-white/50">
                    {NOMBRE_TIPO_MOVIMIENTO[m.tipo]}
                    {m.usuario_id && usuariosPorId.get(m.usuario_id) ? ` · ${usuariosPorId.get(m.usuario_id)}` : ''}
                    {' · '}
                    {new Date(m.fecha).toLocaleDateString('es-AR')}
                  </p>
                </>
              )
              return (
                <li key={m.id} className="py-2 text-sm">
                  {producto ? (
                    <Link
                      href={`/productos/${producto.id}`}
                      className="-mx-1 block rounded-lg px-1 no-underline transition-colors hover:bg-white/5"
                    >
                      {contenido}
                    </Link>
                  ) : (
                    contenido
                  )}
                </li>
              )
            })}
            {actividad.length === 0 && (
              <li className="py-2 text-sm text-white/60">Sin movimientos recientes.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [facturas, setFacturas] = useState<FacturaCompra[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [items, setItems] = useState<ItemFactura[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoStock[]>([])
  const [usuarios, setUsuarios] = useState<UsuarioConEmail[]>([])
  const [ventas, setVentas] = useState<Venta[]>([])
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [perfilError, setPerfilError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      listarFacturas(),
      listarProveedores(),
      listarProductos(),
      listarItemsFactura(),
      listarMovimientosStock(),
    ])
      .then(([f, p, pr, it, mv]) => {
        setFacturas(f)
        setProveedores(p)
        setProductos(pr)
        setItems(it)
        setMovimientos(mv)
      })
      .finally(() => setLoading(false))
    listarVentas().then(setVentas)
  }, [])

  useEffect(() => {
    obtenerOCrearPerfilActual()
      .then((perfilActual) => {
        setPerfil(perfilActual)
        if (perfilActual.rol === 'administrador') {
          listarUsuarios().then(setUsuarios).catch(() => {})
        }
      })
      .catch(() => setPerfilError(true))
  }, [])

  if (loading) {
    return (
      <div className="app-bg dashboard-shell relative isolate min-h-screen overflow-hidden">
        <SkeletonPage>
          <SkeletonStatCards cantidad={3} />
          <SkeletonTable filas={5} columnas={2} />
        </SkeletonPage>
      </div>
    )
  }

  const esAdmin = perfil?.rol === 'administrador'

  const valorStock = calcularValorStock(productos)
  const hace30Dias = new Date()
  hace30Dias.setDate(hace30Dias.getDate() - 30)
  const hace60Dias = new Date()
  hace60Dias.setDate(hace60Dias.getDate() - 60)
  const facturasUltimos30 = facturas.filter(
    (f) => f.estado !== 'anulada' && new Date(f.fecha) >= hace30Dias
  )
  const facturas30a60 = facturas.filter(
    (f) => f.estado !== 'anulada' && new Date(f.fecha) >= hace60Dias && new Date(f.fecha) < hace30Dias
  )
  const gastoUltimos30 = facturasUltimos30.reduce((acc, f) => acc + f.total, 0)
  const gastoPrevios30 = facturas30a60.reduce((acc, f) => acc + f.total, 0)
  const variacionGasto =
    gastoPrevios30 > 0 ? ((gastoUltimos30 - gastoPrevios30) / gastoPrevios30) * 100 : null

  const productosStockBajo = productos.filter((p) => p.stock_actual <= p.stock_minimo)
  const ultimasFacturas = [...facturas].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 5)
  const semanas = calcularGastoPorSemana(facturas, 8)
  const maxSemana = Math.max(1, ...semanas.map((s) => s.total))
  const gastoSemanaActual = calcularGastoPorSemana(facturas, 1)[0]?.total ?? 0
  const gastoMesActual = calcularGastoPorMes(facturas, 1)[0]?.total ?? 0
  const ingresoSemanal = calcularIngresoPorSemana(ventas, 1)[0]?.total ?? 0
  const gastoSemanal = calcularGastoPorSemana(facturas, 1)[0]?.total ?? 0
  const netoSemanal = ingresoSemanal - gastoSemanal

  return (
    <div className="app-bg dashboard-shell relative isolate min-h-screen overflow-hidden">
      <div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
        <div className="rise">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-white/60">
            Panel general
          </p>
          <h1 className="mt-1 text-[27px] font-semibold text-white">
            {perfil?.nombre ? `Bienvenido, ${perfil.nombre}` : 'Bienvenido'}
          </h1>
          {perfilError && <p className="text-xs text-[#ffb4a3]">No se pudo cargar tu perfil.</p>}
        </div>

        {esAdmin && (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <StatShell
                eyebrow="Valor total del stock"
                value={`$${valorStock.toLocaleString('es-AR')}`}
                href="/stock"
              />
              <StatShell eyebrow="Facturas cargadas" value={String(facturas.length)} href="/compras" />
              <StatShell
                eyebrow="Productos bajo mínimo"
                value={String(productosStockBajo.length)}
                href="/stock"
              />
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <StatShell
                eyebrow="Gastado esta semana"
                value={`$${gastoSemanaActual.toLocaleString('es-AR')}`}
                href="/reportes"
              />
              <StatShell
                eyebrow="Gastado este mes"
                value={`$${gastoMesActual.toLocaleString('es-AR')}`}
                href="/reportes"
              />
              <StatShell eyebrow="Ingreso semanal" value={`$${ingresoSemanal.toLocaleString('es-AR')}`} />
              <StatShell
                eyebrow="Neto semanal"
                value={`$${netoSemanal.toLocaleString('es-AR')}`}
                delta={{ texto: netoSemanal >= 0 ? 'positivo' : 'negativo', positivo: netoSemanal >= 0 }}
              />
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
              <HeroStatCard
                href="/compras"
                eyebrow="Gasto en compras"
                value={`$${gastoUltimos30.toLocaleString('es-AR')}`}
                gaugeValue={
                  gastoPrevios30 > 0 ? Math.min(100, (gastoUltimos30 / gastoPrevios30) * 100) : 100
                }
                gaugeTone={variacionGasto !== null && variacionGasto > 0 ? 'negative' : 'positive'}
                comparacion={
                  variacionGasto === null
                    ? 'Últimos 30 días — sin datos para comparar'
                    : `Últimos 30 días · ${variacionGasto <= 0 ? '↓' : '↑'} ${Math.abs(variacionGasto).toFixed(0)}% vs. anterior`
                }
              />

              <div className="grid grid-cols-1 gap-5">
                {RAMAS.map((rama) => {
                  const capital = calcularCapitalEnRiesgoPorRama(productos)[rama]
                  return (
                    <StatShell
                      key={rama}
                      eyebrow={`En riesgo · ${NOMBRE_RAMA[rama]}`}
                      value={`$${capital.valor.toLocaleString('es-AR')}`}
                      delta={{ texto: `${capital.cantidad} prod.`, positivo: capital.cantidad === 0 }}
                      href="/stock"
                    />
                  )
                })}
              </div>

              <Link href="/reportes" className="glass-shell group rise block no-underline">
                <div className="glass-core">
                  <div className="mb-6 flex items-center justify-between">
                    <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-white/60 transition-colors group-hover:text-accent">
                      Gasto por semana
                    </p>
                    <span className="mono text-xs text-white/50">últimas 8 semanas</span>
                  </div>
                  <div className="flex h-36 items-end gap-3">
                    {semanas.map((s) => (
                      <div key={s.semana} className="flex flex-1 flex-col items-center gap-2">
                        <div
                          className="w-full rounded-t-[8px] bg-accent transition-[height] duration-500"
                          style={{ height: `${Math.max(4, (s.total / maxSemana) * 100)}%` }}
                          title={`$${s.total.toLocaleString('es-AR')}`}
                        />
                        <span className="mono text-[10px] text-white/50">
                          {new Date(s.semana).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Link>
            </div>

            <div>
              <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-white/60">
                Por rama de negocio
              </p>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {RAMAS.map((rama) => (
                  <SeccionRama
                    key={rama}
                    rama={rama}
                    productos={productos}
                    facturasUltimos30={facturasUltimos30}
                    items={items}
                    proveedores={proveedores}
                    movimientos={movimientos}
                    usuarios={usuarios}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        <div className="glass-shell rise">
          <div className="glass-core">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-white/60">
                Stock bajo
              </p>
              <Link href="/stock" className="text-xs font-semibold text-accent hover:underline">
                Ver todo
              </Link>
            </div>
            <ul className="divide-y divide-white/10">
              {productosStockBajo.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/productos/${p.id}`}
                    className="-mx-1 flex items-center justify-between rounded-lg px-1 py-2.5 text-sm no-underline transition-colors hover:bg-white/5"
                  >
                    <span className="text-white">{p.nombre}</span>
                    <span className="chip chip-on-glass down">
                      {p.stock_actual} {p.unidad_stock}
                    </span>
                  </Link>
                </li>
              ))}
              {productosStockBajo.length === 0 && (
                <li className="py-2.5 text-sm text-white/60">Ningún producto está bajo el mínimo.</li>
              )}
            </ul>
          </div>
        </div>

        {esAdmin && (
          <div className="glass-shell rise">
            <div className="glass-core">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-white/60">
                  Últimas facturas
                </p>
                <Link href="/compras" className="text-xs font-semibold text-accent hover:underline">
                  Ver todo
                </Link>
              </div>
              <ul className="divide-y divide-white/10">
                {ultimasFacturas.map((f) => {
                  const proveedor = proveedores.find((p) => p.id === f.proveedor_id)
                  return (
                    <li key={f.id}>
                      <Link
                        href={`/compras/${f.id}`}
                        className="-mx-1 flex items-center justify-between rounded-lg px-1 py-2.5 text-sm no-underline transition-colors hover:bg-white/5"
                      >
                        <span className="text-white">
                          <span className="mono text-white/50">{f.fecha}</span> — {proveedor?.nombre ?? '—'}
                          {f.estado === 'anulada' && <span className="chip chip-on-glass down ml-2">ANULADA</span>}
                        </span>
                        <span className="mono font-semibold text-white">${f.total.toLocaleString('es-AR')}</span>
                      </Link>
                    </li>
                  )
                })}
                {ultimasFacturas.length === 0 && (
                  <li className="py-2.5 text-sm text-white/60">Sin facturas aún.</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
