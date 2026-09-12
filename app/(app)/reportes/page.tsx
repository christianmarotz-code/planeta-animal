'use client'

import { useEffect, useState } from 'react'
import { listarFacturas, listarItemsFactura } from '@/lib/data/facturas'
import { listarProveedores } from '@/lib/data/proveedores'
import { listarProductos } from '@/lib/data/productos'
import {
  calcularGastoPorProveedor,
  calcularValorStock,
  calcularGastoPorSemana,
  calcularGastoPorMes,
  calcularGastoPorDiaSemana,
  anosConFacturas,
  calcularGastoPorTrimestre,
  calcularSemanaGanadoraPorMes,
  calcularProductosMasComprados,
} from '@/lib/data/reportes'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import { SkeletonPage, SkeletonStatCards, SkeletonTable } from '@/components/Skeleton'
import type { FacturaCompra, Proveedor, Producto, ItemFactura } from '@/types/database'

const NOMBRES_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const ABREV_DIA: Record<string, string> = {
  Lunes: 'Lun',
  Martes: 'Mar',
  Miércoles: 'Mié',
  Jueves: 'Jue',
  Viernes: 'Vie',
  Sábado: 'Sáb',
  Domingo: 'Dom',
}

function GraficoBarras({
  titulo,
  subtitulo,
  datos,
}: {
  titulo: string
  subtitulo: string
  datos: { etiqueta: string; total: number }[]
}) {
  const maximo = Math.max(1, ...datos.map((d) => d.total))
  return (
    <div className="shell rise">
      <div className="core">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            {titulo}
          </p>
          <span className="mono text-xs text-ink-faint">{subtitulo}</span>
        </div>
        <div className="flex h-36 items-end gap-3">
          {datos.map((d, i) => (
            <div key={`${d.etiqueta}-${i}`} className="flex flex-1 flex-col items-center gap-2">
              <div
                className="w-full rounded-t-[8px] bg-accent transition-[height] duration-500"
                style={{ height: `${Math.max(4, (d.total / maximo) * 100)}%` }}
                title={`$${d.total.toLocaleString('es-AR')}`}
              />
              <span className="mono text-[10px] text-ink-faint">{d.etiqueta}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ReportesPage() {
  const esAdmin = useEsAdministrador()
  const [facturas, setFacturas] = useState<FacturaCompra[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [items, setItems] = useState<ItemFactura[]>([])
  const [anioSeleccionado, setAnioSeleccionado] = useState<number | null>(null)

  useEffect(() => {
    listarFacturas().then(setFacturas)
    listarProveedores().then(setProveedores)
    listarProductos().then(setProductos)
    listarItemsFactura().then(setItems)
  }, [])

  if (esAdmin === null) {
    return (
      <SkeletonPage>
        <SkeletonStatCards cantidad={1} />
        <SkeletonTable filas={6} columnas={2} />
      </SkeletonPage>
    )
  }
  if (esAdmin === false) {
    return (
      <p className="p-8 text-sm text-negative">
        Acceso restringido — contactá a un administrador.
      </p>
    )
  }

  const gastoPorProveedor = calcularGastoPorProveedor(facturas, proveedores)
  const valorStock = calcularValorStock(productos)
  const productosStockBajo = productos.filter((p) => p.stock_actual <= p.stock_minimo)

  const datosPorMes = calcularGastoPorMes(facturas, 12).map((m) => ({
    etiqueta: NOMBRES_MES[Number(m.mes.slice(5, 7)) - 1],
    total: m.total,
  }))
  const datosPorSemana = calcularGastoPorSemana(facturas, 12).map((s) => ({
    etiqueta: new Date(s.semana).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
    total: s.total,
  }))
  const datosPorDiaSemana = calcularGastoPorDiaSemana(facturas, 12).map((d) => ({
    etiqueta: ABREV_DIA[d.dia],
    total: d.total,
  }))

  const anios = anosConFacturas(facturas)
  const anioActivo = anioSeleccionado ?? anios[0] ?? new Date().getFullYear()
  const opcionesAnio = anios.length > 0 ? anios : [anioActivo]

  const datosPorTrimestre = calcularGastoPorTrimestre(facturas, anioActivo).map((t) => ({
    etiqueta: t.trimestre,
    total: t.total,
  }))
  const semanaGanadoraPorMes = calcularSemanaGanadoraPorMes(facturas, anioActivo)
  const productosRanking = calcularProductosMasComprados(items, facturas, productos, anioActivo)
  const masComprados = productosRanking.slice(0, 10)
  const menosComprados = productosRanking.slice(Math.max(10, productosRanking.length - 10)).reverse()

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="rise">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Gestión
        </p>
        <h1 className="mt-1 text-[27px] text-ink">Reportes</h1>
      </div>

      <div className="shell w-fit rise">
        <div className="core">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Valor total del stock actual
          </p>
          <p className="mono mt-2 text-[40px] font-medium leading-none text-ink">
            ${valorStock.toLocaleString('es-AR')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="shell rise">
          <div className="core">
            <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Gasto en compras por proveedor
            </p>
            <ul className="divide-y divide-line">
              {gastoPorProveedor.map((g) => (
                <li key={g.proveedor} className="flex justify-between py-2.5 text-sm">
                  <span className="text-ink">{g.proveedor}</span>
                  <span className="mono font-semibold text-ink">${g.total.toLocaleString('es-AR')}</span>
                </li>
              ))}
              {gastoPorProveedor.length === 0 && (
                <li className="py-2.5 text-sm text-ink-faint">Sin compras aún.</li>
              )}
            </ul>
          </div>
        </div>

        <div className="shell rise">
          <div className="core">
            <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Productos con stock bajo
            </p>
            <ul className="divide-y divide-line">
              {productosStockBajo.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-ink">{p.nombre}</span>
                  <span className="chip down">
                    {p.stock_actual} / {p.stock_minimo} {p.unidad_stock}
                  </span>
                </li>
              ))}
              {productosStockBajo.length === 0 && (
                <li className="py-2.5 text-sm text-ink-faint">Ningún producto está bajo el mínimo.</li>
              )}
            </ul>
          </div>
        </div>
      </div>

      <GraficoBarras titulo="Gasto por mes" subtitulo="últimos 12 meses" datos={datosPorMes} />
      <GraficoBarras titulo="Gasto por semana" subtitulo="últimas 12 semanas" datos={datosPorSemana} />
      <GraficoBarras titulo="Gasto por día de la semana" subtitulo="últimos 12 meses" datos={datosPorDiaSemana} />

      <div className="flex items-center justify-between rise">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Análisis anual
        </p>
        <select
          value={anioActivo}
          onChange={(e) => setAnioSeleccionado(Number(e.target.value))}
          className="rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none focus:border-accent"
        >
          {opcionesAnio.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <GraficoBarras titulo="Gasto por trimestre" subtitulo={String(anioActivo)} datos={datosPorTrimestre} />

      <div className="shell rise overflow-x-auto">
        <div className="core">
          <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Semana que más gastó, por mes
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-line-strong text-left">
                <th className="px-3 py-2 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  Mes
                </th>
                <th className="px-3 py-2 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  Semana ganadora
                </th>
                <th className="px-3 py-2 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {semanaGanadoraPorMes.map((s) => (
                <tr key={s.mes} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-ink">{NOMBRES_MES[Number(s.mes.slice(5, 7)) - 1]}</td>
                  <td className="mono px-3 py-2 text-ink-soft">
                    {s.semana === 0 ? '—' : `Semana ${s.semana}`}
                  </td>
                  <td className="mono px-3 py-2 text-ink">
                    {s.semana === 0 ? '—' : `$${s.total.toLocaleString('es-AR')}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="shell rise">
          <div className="core">
            <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Productos más comprados
            </p>
            <ul className="divide-y divide-line">
              {masComprados.map((p, i) => (
                <li key={`${p.producto}-${i}`} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-ink">{p.producto}</span>
                  <span className="mono font-semibold text-ink">{p.cantidad}</span>
                </li>
              ))}
              {masComprados.length === 0 && (
                <li className="py-2.5 text-sm text-ink-faint">Sin compras en {anioActivo}.</li>
              )}
            </ul>
          </div>
        </div>

        <div className="shell rise">
          <div className="core">
            <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Productos menos comprados
            </p>
            <ul className="divide-y divide-line">
              {menosComprados.map((p, i) => (
                <li key={`${p.producto}-${i}`} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-ink">{p.producto}</span>
                  <span className="mono text-ink-soft">{p.cantidad}</span>
                </li>
              ))}
              {menosComprados.length === 0 && (
                <li className="py-2.5 text-sm text-ink-faint">Sin compras en {anioActivo}.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
