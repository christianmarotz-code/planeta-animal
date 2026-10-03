import Link from 'next/link'
import { formatearMonto } from '@/lib/calc/factura'
import { formatearFechaCorta } from '@/lib/facturas/meses'
import type { FacturaCompra } from '@/types/database'

export function FilaFactura({
  factura,
  proveedor,
  mostrarTotal,
}: {
  factura: FacturaCompra
  proveedor: string
  mostrarTotal: boolean
}) {
  return (
    <Link
      href={`/compras/${factura.id}`}
      className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm transition hover:bg-accent/5"
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-semibold text-ink">{proveedor}</span>
        <span className="text-ink-soft">
          {factura.tipo_comprobante} <span className="mono">{factura.numero_comprobante}</span>
          <span className="text-ink-faint"> · {formatearFechaCorta(factura.fecha)}</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-3">
        {factura.estado === 'anulada' && <span className="chip down">ANULADA</span>}
        {factura.estado === 'revision' && <span className="chip down">REVISIÓN</span>}
        {mostrarTotal && <span className="mono font-semibold text-ink">{formatearMonto(factura.total)}</span>}
      </span>
    </Link>
  )
}
