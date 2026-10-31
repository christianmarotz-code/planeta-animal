import { formatearMonto } from '@/lib/calc/factura'
import { formatearFechaCorta } from '@/lib/facturas/meses'
import type { Gasto } from '@/types/database'
import { NOMBRE_CATEGORIA } from './categorias'

export function FilaGasto({ gasto }: { gasto: Gasto }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm">
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-semibold text-ink">{gasto.concepto}</span>
        <span className="text-ink-soft">
          <span className="mono">{formatearFechaCorta(gasto.fecha)}</span>
          {gasto.proveedor && <span className="text-ink-faint"> · {gasto.proveedor}</span>}
          <span className="chip ml-2">{NOMBRE_CATEGORIA[gasto.categoria]}</span>
        </span>
      </span>
      <span className="mono shrink-0 font-semibold text-ink">{formatearMonto(gasto.monto)}</span>
    </div>
  )
}
