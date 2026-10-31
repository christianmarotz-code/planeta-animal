'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { listarFacturas, listarItemsFactura } from '@/lib/data/facturas'
import { listarProveedores } from '@/lib/data/proveedores'
import { listarProductos } from '@/lib/data/productos'
import { listarVentas, listarItemsVenta } from '@/lib/data/ventas'
import { listarServicios } from '@/lib/data/servicios'
import { listarGastos } from '@/lib/data/gastos'
import { listarComparador, type FilaComparador } from '@/lib/data/preciosProveedor'
import { formatearMonto } from '@/lib/calc/factura'
import { etiquetaMes } from '@/lib/facturas/meses'
import {
  armarHistorial,
  armarReporteMensual,
  mesAnterior,
  mesQueMasSeGasto,
  rankingProveedoresComparador,
  variacionPorcentual,
  type DatosReporte,
} from '@/lib/reportes/mensual'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import { SkeletonPage, SkeletonList } from '@/components/Skeleton'
import { NOMBRE_CATEGORIA } from '../../../gastos/categorias'

const ROTULO = 'text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint'
const NOMBRE_MEDIO = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' } as const

function Variacion({ actual, previo, subirEsBueno }: { actual: number; previo: number | undefined; subirEsBueno: boolean }) {
  const v = variacionPorcentual(actual, previo)
  if (v === null) return <span className="text-[11px] text-ink-faint">sin mes anterior</span>
  const bueno = subirEsBueno ? v >= 0 : v < 0
  return (
    <span className={`text-[11px] font-medium ${bueno ? 'text-positive' : 'text-negative'}`}>
      {v >= 0 ? '▲' : '▼'} {Math.abs(v).toFixed(0)} % vs mes anterior
    </span>
  )
}

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="shell rise">
      <div className="core">
        <p className={`mb-3 ${ROTULO}`}>{titulo}</p>
        {children}
      </div>
    </div>
  )
}

function Lista({ filas, vacio }: { filas: { clave: string; izq: React.ReactNode; der: React.ReactNode }[]; vacio: string }) {
  return (
    <ul className="divide-y divide-line">
      {filas.map((f) => (
        <li key={f.clave} className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <span className="min-w-0 truncate text-ink">{f.izq}</span>
          <span className="mono shrink-0 font-semibold text-ink">{f.der}</span>
        </li>
      ))}
      {filas.length === 0 && <li className="py-2.5 text-sm text-ink-faint">{vacio}</li>}
    </ul>
  )
}

export default function ReporteDelMesPage() {
  const { mes: mesActivo } = useParams<{ mes: string }>()
  const esAdmin = useEsAdministrador()
  const [datos, setDatos] = useState<DatosReporte | null>(null)
  const [comparador, setComparador] = useState<FilaComparador[]>([])

  useEffect(() => {
    if (!esAdmin) return
    Promise.all([
      listarFacturas(),
      listarItemsFactura(),
      listarVentas(),
      listarItemsVenta(),
      listarGastos(),
      listarProductos(),
      listarProveedores(),
      listarServicios(),
    ]).then(([facturas, itemsFactura, ventas, itemsVenta, gastos, productos, proveedores, servicios]) =>
      setDatos({ facturas, itemsFactura, ventas, itemsVenta, gastos, productos, proveedores, servicios })
    )
    listarComparador().then(setComparador)
  }, [esAdmin])

  const historial = useMemo(() => (datos ? armarHistorial(datos) : []), [datos])
  const reporte = useMemo(() => (datos ? armarReporteMensual(mesActivo, datos) : null), [datos, mesActivo])
  const previo = historial.find((h) => h.mes === mesAnterior(mesActivo))
  const peor = mesQueMasSeGasto(historial)
  const ranking = useMemo(() => rankingProveedoresComparador(comparador), [comparador])

  if (esAdmin === null || (esAdmin && !datos)) {
    return (
      <SkeletonPage>
        <SkeletonList filas={8} />
      </SkeletonPage>
    )
  }
  if (esAdmin === false) {
    return <p className="p-8 text-sm text-negative">Acceso restringido — contactá a un administrador.</p>
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3 rise">
        <div>
          <Link href="/reportes" className={`${ROTULO} hover:text-ink`}>
            ← Reportes
          </Link>
          <h1 className="mt-1 text-[27px] text-ink">{etiquetaMes(mesActivo)}</h1>
        </div>
      </div>

      {!reporte ? (
        <p className="card rise px-5 py-6 text-sm text-ink-faint">Sin movimientos en este mes.</p>
      ) : (
        <>
          <div className="grid gap-4 rise sm:grid-cols-2 lg:grid-cols-4">
            {[
              { t: 'Compras', v: reporte.compras.total, p: previo?.compras, bueno: false, sub: `${reporte.compras.cantidad} facturas` },
              { t: 'Gastos', v: reporte.gastos.total, p: previo?.gastos, bueno: false, sub: `${reporte.gastos.cantidad} gastos` },
              { t: 'Ventas', v: reporte.ventas.total, p: previo?.ventas, bueno: true, sub: `${reporte.ventas.cantidad} ventas` },
              { t: 'Balance', v: reporte.balance, p: previo?.balance, bueno: true, sub: 'ventas − compras − gastos' },
            ].map((k) => (
              <div key={k.t} className="card flex flex-col gap-1 p-5">
                <span className={ROTULO}>{k.t}</span>
                <span className="mono text-xl font-semibold text-ink">{formatearMonto(k.v)}</span>
                <span className="text-xs text-ink-soft">{k.sub}</span>
                <Variacion actual={k.v} previo={k.p} subirEsBueno={k.bueno} />
              </div>
            ))}
          </div>

          {peor && (
            <p className="card rise px-5 py-4 text-sm text-ink-soft">
              {peor.mes === mesActivo ? (
                <>Este es el mes en que más salió plata del negocio: </>
              ) : (
                <>El mes que más se gastó fue <span className="font-semibold text-ink">{etiquetaMes(peor.mes)}</span>: </>
              )}
              <span className="mono font-semibold text-ink">{formatearMonto(peor.egresos)}</span> entre compras y gastos.
            </p>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Tarjeta titulo="Proveedores a los que más se compró">
              <Lista
                vacio="Sin compras este mes."
                filas={reporte.compras.proveedores.map((p) => ({
                  clave: p.proveedor,
                  izq: p.proveedor,
                  der: `${formatearMonto(p.total)} · ${p.porcentaje.toFixed(0)}%`,
                }))}
              />
            </Tarjeta>
            <Tarjeta titulo="Productos más comprados (unidades)">
              <Lista
                vacio="Sin compras este mes."
                filas={reporte.compras.productos.map((p) => ({ clave: p.nombre, izq: p.nombre, der: p.cantidad }))}
              />
            </Tarjeta>
            <Tarjeta titulo="Stock más usado (unidades vendidas)">
              <Lista
                vacio="Sin ventas de productos este mes."
                filas={reporte.ventas.productos.map((p) => ({ clave: p.nombre, izq: p.nombre, der: p.cantidad }))}
              />
            </Tarjeta>
            <Tarjeta titulo="Servicios más vendidos">
              <Lista
                vacio="Sin servicios vendidos este mes."
                filas={reporte.ventas.servicios.map((s) => ({ clave: s.nombre, izq: s.nombre, der: s.cantidad }))}
              />
            </Tarjeta>
            <Tarjeta titulo="Ventas">
              <p className="mb-2 text-sm text-ink-soft">
                Ticket promedio: <span className="mono font-semibold text-ink">{formatearMonto(reporte.ventas.ticketPromedio)}</span>
              </p>
              <Lista
                vacio="Sin ventas este mes."
                filas={reporte.ventas.porMedioPago.map((m) => ({
                  clave: m.medioPago,
                  izq: NOMBRE_MEDIO[m.medioPago],
                  der: formatearMonto(m.total),
                }))}
              />
            </Tarjeta>
            <Tarjeta titulo="Gastos por categoría">
              <Lista
                vacio="Sin gastos este mes."
                filas={reporte.gastos.porCategoria.map((c) => ({
                  clave: c.categoria,
                  izq: NOMBRE_CATEGORIA[c.categoria],
                  der: formatearMonto(c.total),
                }))}
              />
            </Tarjeta>
            <Tarjeta titulo="Gastos más grandes">
              <Lista
                vacio="Sin gastos este mes."
                filas={reporte.gastos.mayores.map((g) => ({ clave: g.id, izq: g.concepto, der: formatearMonto(g.monto) }))}
              />
            </Tarjeta>
            <Tarjeta titulo="Comparador de proveedores (precios actuales)">
              <Lista
                vacio="Sin precios cargados en el comparador."
                filas={ranking.slice(0, 8).map((r) => ({
                  clave: r.proveedor,
                  izq: r.proveedor,
                  der: `${r.ganados} más barato · ${r.cotizados} cotizados`,
                }))}
              />
              <p className="mt-2 text-xs text-ink-faint">
                Más barato = tiene el menor precio entre varios proveedores. Cotizados = productos con precio cargado. Es la foto de hoy, no del mes.
              </p>
            </Tarjeta>
          </div>
        </>
      )}
    </div>
  )
}
