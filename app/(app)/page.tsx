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
  calcularIngresoPorSemana,
  inicioSemana,
  RAMAS,
} from '@/lib/data/reportes'
import { obtenerOCrearPerfilActual } from '@/lib/data/perfiles'
import { HeroStatCard } from '@/components/HeroStatCard'
import { StatShell } from '@/components/dashboard/StatShell'
import { SeccionRama, NOMBRE_RAMA } from '@/components/dashboard/SeccionRama'
import { SkeletonPage, SkeletonStatCards, SkeletonTable } from '@/components/Skeleton'
import type {
  FacturaCompra,
  Proveedor,
  Producto,
  Perfil,
  ItemFactura,
  MovimientoStock,
  Venta,
} from '@/types/database'

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
    // Inicio solo usa los últimos 30 días de ítems y la semana actual de ventas:
    // no hace falta traer el historial completo (crece con cada compra y cada venta).
    const hace31Dias = new Date()
    hace31Dias.setDate(hace31Dias.getDate() - 31)
    Promise.all([
      listarFacturas(),
      listarProveedores(),
      listarProductos(),
      listarItemsFactura({ desde: inicioSemana(hace31Dias) }),
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
    listarVentas({ desde: inicioSemana(new Date()) }).then(setVentas)
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
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
            Panel general
          </p>
          <h1 className="mt-1 text-[27px] font-semibold text-ink">
            {perfil?.nombre ? `Bienvenido, ${perfil.nombre}` : 'Bienvenido'}
          </h1>
          {perfilError && <p className="text-xs text-negative">No se pudo cargar tu perfil.</p>}
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
                    <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-soft transition-colors group-hover:text-accent">
                      Gasto por semana
                    </p>
                    <span className="mono text-xs text-ink-faint">últimas 8 semanas</span>
                  </div>
                  <div className="flex h-36 items-end gap-3">
                    {semanas.map((s) => (
                      <div key={s.semana} className="flex flex-1 flex-col items-center gap-2">
                        <div
                          className="w-full rounded-t-[8px] bg-accent transition-[height] duration-500"
                          style={{ height: `${Math.max(4, (s.total / maxSemana) * 100)}%` }}
                          title={`$${s.total.toLocaleString('es-AR')}`}
                        />
                        <span className="mono text-[10px] text-ink-faint">
                          {new Date(s.semana).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Link>
            </div>

            <div>
              <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
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
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                Stock bajo
              </p>
              <Link href="/stock" className="text-xs font-semibold text-accent hover:underline">
                Ver todo
              </Link>
            </div>
            <ul className="divide-y divide-line">
              {productosStockBajo.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/productos/${p.id}`}
                    className="-mx-1 flex items-center justify-between rounded-lg px-1 py-2.5 text-sm no-underline transition-colors hover:bg-ink/5"
                  >
                    <span className="text-ink">{p.nombre}</span>
                    <span className="chip chip-on-glass down">
                      {p.stock_actual} {p.unidad_stock}
                    </span>
                  </Link>
                </li>
              ))}
              {productosStockBajo.length === 0 && (
                <li className="py-2.5 text-sm text-ink-soft">Ningún producto está bajo el mínimo.</li>
              )}
            </ul>
          </div>
        </div>

        {esAdmin && (
          <div className="glass-shell rise">
            <div className="glass-core">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                  Últimas facturas
                </p>
                <Link href="/compras" className="text-xs font-semibold text-accent hover:underline">
                  Ver todo
                </Link>
              </div>
              <ul className="divide-y divide-line">
                {ultimasFacturas.map((f) => {
                  const proveedor = proveedores.find((p) => p.id === f.proveedor_id)
                  return (
                    <li key={f.id}>
                      <Link
                        href={`/compras/${f.id}`}
                        className="-mx-1 flex items-center justify-between rounded-lg px-1 py-2.5 text-sm no-underline transition-colors hover:bg-ink/5"
                      >
                        <span className="text-ink">
                          <span className="mono text-ink-faint">{f.fecha}</span> — {proveedor?.nombre ?? '—'}
                          {f.estado === 'anulada' && <span className="chip chip-on-glass down ml-2">ANULADA</span>}
                        </span>
                        <span className="mono font-semibold text-ink">${f.total.toLocaleString('es-AR')}</span>
                      </Link>
                    </li>
                  )
                })}
                {ultimasFacturas.length === 0 && (
                  <li className="py-2.5 text-sm text-ink-soft">Sin facturas aún.</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
