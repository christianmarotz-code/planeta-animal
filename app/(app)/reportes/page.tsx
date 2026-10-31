'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { listarFacturas } from '@/lib/data/facturas'
import { listarVentas } from '@/lib/data/ventas'
import { listarGastos } from '@/lib/data/gastos'
import { formatearMonto } from '@/lib/calc/factura'
import { etiquetaMes } from '@/lib/facturas/meses'
import { armarHistorial, mesAnterior, mesQueMasSeGasto, variacionPorcentual } from '@/lib/reportes/mensual'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import { SkeletonPage, SkeletonList } from '@/components/Skeleton'
import type { FacturaCompra, Gasto, Venta } from '@/types/database'

export default function ReportesPage() {
  const esAdmin = useEsAdministrador()
  const [datos, setDatos] = useState<{ facturas: FacturaCompra[]; ventas: Venta[]; gastos: Gasto[] } | null>(null)

  useEffect(() => {
    if (!esAdmin) return
    Promise.all([listarFacturas(), listarVentas(), listarGastos()]).then(([facturas, ventas, gastos]) =>
      setDatos({ facturas, ventas, gastos })
    )
  }, [esAdmin])

  const historial = useMemo(() => (datos ? armarHistorial(datos) : []), [datos])
  const peor = mesQueMasSeGasto(historial)

  if (esAdmin === null || (esAdmin && !datos)) {
    return (
      <SkeletonPage>
        <SkeletonList filas={6} />
      </SkeletonPage>
    )
  }
  if (esAdmin === false) {
    return <p className="p-8 text-sm text-negative">Acceso restringido — contactá a un administrador.</p>
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="flex items-center justify-between rise">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Gestión</p>
          <h1 className="mt-1 text-[27px] text-ink">Reportes</h1>
        </div>
        <Link href="/reportes/general" className="pill-btn">
          Análisis general
        </Link>
      </div>

      {peor && (
        <p className="card rise px-5 py-4 text-sm text-ink-soft">
          El mes que más se gastó fue <span className="font-semibold text-ink">{etiquetaMes(peor.mes)}</span>:{' '}
          <span className="mono font-semibold text-ink">{formatearMonto(peor.egresos)}</span> entre compras y gastos.
        </p>
      )}

      {historial.length === 0 ? (
        <p className="card rise px-5 py-6 text-sm text-ink-faint">Sin movimientos aún.</p>
      ) : (
        <div className="grid gap-4 rise sm:grid-cols-2 lg:grid-cols-3">
          {historial.map((m) => {
            const v = variacionPorcentual(m.egresos, historial.find((h) => h.mes === mesAnterior(m.mes))?.egresos)
            return (
              <Link
                key={m.mes}
                href={`/reportes/mes/${m.mes}`}
                className="card flex flex-col gap-3 p-5 transition hover:-translate-y-0.5 hover:border-accent"
              >
                <span className="flex items-center justify-between">
                  <span className="text-[17px] font-semibold text-ink">{etiquetaMes(m.mes)}</span>
                  {m.mes === peor?.mes && <span className="chip down">Más gasto</span>}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-xs text-ink-soft">Egresos (compras + gastos)</span>
                  <span className="mono text-lg font-semibold text-ink">{formatearMonto(m.egresos)}</span>
                  {v !== null && (
                    <span
                      className={`whitespace-nowrap text-[11px] font-medium ${v >= 0 ? 'text-negative' : 'text-positive'}`}
                      title="Contra el mes anterior (subir es gastar más)"
                    >
                      {v >= 0 ? '▲' : '▼'} {Math.abs(v).toFixed(0)} % vs mes anterior
                    </span>
                  )}
                </span>
                <span className="flex justify-between text-sm text-ink-soft">
                  <span>Ventas {formatearMonto(m.ventas)}</span>
                  <span className={m.balance >= 0 ? 'text-positive' : 'text-negative'}>
                    Balance {formatearMonto(m.balance)}
                  </span>
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
