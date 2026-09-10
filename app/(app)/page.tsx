'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listarFacturas, listarItemsFactura } from '@/lib/data/facturas'
import { listarProveedores } from '@/lib/data/proveedores'
import { listarProductos } from '@/lib/data/productos'
import { listarMovimientosStock } from '@/lib/data/movimientos'
import { listarUsuarios, type UsuarioConEmail } from '@/lib/data/usuarios'
import {
  calcularValorStock,
  calcularGastoPorSemana,
  calcularCapitalEnRiesgoPorRama,
  calcularGastoPorProveedorPorRama,
  calcularComprobantesPorRama,
  RAMAS,
} from '@/lib/data/reportes'
import { obtenerOCrearPerfilActual } from '@/lib/data/perfiles'
import type { FacturaCompra, Proveedor, Producto, Perfil, ItemFactura, MovimientoStock, Rama } from '@/types/database'

const NOMBRE_RAMA: Record<Rama, string> = { clinica: 'Clínica', petshop: 'Petshop' }
const NOMBRE_TIPO_MOVIMIENTO: Record<MovimientoStock['tipo'], string> = {
  entrada_compra: 'Entrada por compra',
  ajuste_manual: 'Ajuste manual',
}

function StatShell({
  eyebrow,
  value,
  delta,
  children,
}: {
  eyebrow: string
  value: string
  delta?: { texto: string; positivo: boolean }
  children?: React.ReactNode
}) {
  return (
    <div className="shell rise">
      <div className="core flex h-full flex-col justify-between gap-4">
        <div className="flex items-start justify-between">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            {eyebrow}
          </p>
          {delta && (
            <span className={`chip ${delta.positivo ? 'up' : 'down'}`}>
              {delta.positivo ? '↑' : '↓'} {delta.texto}
            </span>
          )}
        </div>
        <p className="mono text-[27px] font-medium leading-none text-ink">{value}</p>
        {children}
      </div>
    </div>
  )
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
    <div className="shell rise">
      <div className="core flex flex-col gap-5">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          {NOMBRE_RAMA[rama]}
        </p>

        <div className="flex items-start justify-between">
          <p className="text-xs text-ink-faint">Capital en riesgo (stock bajo mínimo)</p>
          <span className="chip down">{capital.cantidad} prod.</span>
        </div>
        <p className="mono -mt-3 text-xl font-medium text-ink">
          ${capital.valor.toLocaleString('es-AR')}
        </p>

        <div>
          <p className="mb-2 text-xs text-ink-faint">Top proveedores (30 días, neto)</p>
          <ul className="divide-y divide-line">
            {topProveedores.map((p) => (
              <li key={p.proveedor} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">{p.proveedor}</span>
                <span className="mono text-ink-soft">${p.total.toLocaleString('es-AR')}</span>
              </li>
            ))}
            {topProveedores.length === 0 && (
              <li className="py-2 text-sm text-ink-faint">Sin compras en los últimos 30 días.</li>
            )}
          </ul>
        </div>

        <div>
          <p className="mb-2 text-xs text-ink-faint">Comprobantes (30 días)</p>
          <ul className="divide-y divide-line">
            {comprobantes.map((c) => (
              <li key={c.tipo} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">
                  {c.tipo} <span className="text-ink-faint">({c.cantidad})</span>
                </span>
                <span className="mono text-ink-soft">${c.total.toLocaleString('es-AR')}</span>
              </li>
            ))}
            {comprobantes.length === 0 && (
              <li className="py-2 text-sm text-ink-faint">Sin comprobantes en los últimos 30 días.</li>
            )}
          </ul>
        </div>

        <div>
          <p className="mb-2 text-xs text-ink-faint">Actividad reciente</p>
          <ul className="divide-y divide-line">
            {actividad.map((m) => (
              <li key={m.id} className="py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-ink">{productosPorId.get(m.producto_id)?.nombre ?? '—'}</span>
                  <span className="mono text-ink-soft">
                    {m.tipo === 'ajuste_manual' && m.cantidad > 0 ? '+' : ''}
                    {m.cantidad}
                  </span>
                </div>
                <p className="mono text-[11px] text-ink-faint">
                  {NOMBRE_TIPO_MOVIMIENTO[m.tipo]}
                  {m.usuario_id && usuariosPorId.get(m.usuario_id) ? ` · ${usuariosPorId.get(m.usuario_id)}` : ''}
                  {' · '}
                  {new Date(m.fecha).toLocaleDateString('es-AR')}
                </p>
              </li>
            ))}
            {actividad.length === 0 && (
              <li className="py-2 text-sm text-ink-faint">Sin movimientos recientes.</li>
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
    return <p className="text-sm text-ink-soft">Cargando…</p>
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

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="rise">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Panel general
        </p>
        <h1 className="mt-1 text-[27px] text-ink">
          {perfil?.nombre ? `Bienvenido, ${perfil.nombre}` : 'Bienvenido'}
        </h1>
        {perfilError && <p className="text-xs text-negative">No se pudo cargar tu perfil.</p>}
      </div>

      {esAdmin && (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <StatShell eyebrow="Valor total del stock" value={`$${valorStock.toLocaleString('es-AR')}`} />
            <StatShell
              eyebrow="Gasto en compras (30 días)"
              value={`$${gastoUltimos30.toLocaleString('es-AR')}`}
              delta={
                variacionGasto === null
                  ? undefined
                  : { texto: `${Math.abs(variacionGasto).toFixed(0)}%`, positivo: variacionGasto <= 0 }
              }
            />
            <StatShell eyebrow="Facturas cargadas" value={String(facturas.length)} />
          </div>

          <div className="shell rise">
            <div className="core">
              <div className="mb-6 flex items-center justify-between">
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
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
          </div>

          <div>
            <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
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

      <div className="shell rise">
        <div className="core">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Stock bajo
            </p>
            <Link href="/stock" className="text-xs font-semibold text-accent hover:underline">
              Ver todo
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {productosStockBajo.slice(0, 6).map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-ink">{p.nombre}</span>
                <span className="chip down">
                  {p.stock_actual} {p.unidad_stock}
                </span>
              </li>
            ))}
            {productosStockBajo.length === 0 && (
              <li className="py-2.5 text-sm text-ink-faint">Ningún producto está bajo el mínimo.</li>
            )}
          </ul>
        </div>
      </div>

      {esAdmin && (
        <div className="shell rise">
          <div className="core">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
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
                  <li key={f.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="text-ink">
                      <span className="mono text-ink-faint">{f.fecha}</span> — {proveedor?.nombre ?? '—'}
                      {f.estado === 'anulada' && <span className="chip down ml-2">ANULADA</span>}
                    </span>
                    <span className="mono font-semibold text-ink">${f.total.toLocaleString('es-AR')}</span>
                  </li>
                )
              })}
              {ultimasFacturas.length === 0 && (
                <li className="py-2.5 text-sm text-ink-faint">Sin facturas aún.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
