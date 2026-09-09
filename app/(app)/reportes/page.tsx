'use client'

import { useEffect, useState } from 'react'
import { listarFacturas } from '@/lib/data/facturas'
import { listarProveedores } from '@/lib/data/proveedores'
import { listarProductos } from '@/lib/data/productos'
import {
  calcularGastoPorProveedor,
  calcularValorStock,
  calcularGastoPorSemana,
  calcularGastoPorMes,
  calcularGastoPorDiaSemana,
} from '@/lib/data/reportes'
import type { FacturaCompra, Proveedor, Producto } from '@/types/database'

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
  const [facturas, setFacturas] = useState<FacturaCompra[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos, setProductos] = useState<Producto[]>([])

  useEffect(() => {
    listarFacturas().then(setFacturas)
    listarProveedores().then(setProveedores)
    listarProductos().then(setProductos)
  }, [])

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
    </div>
  )
}
