import { formatearMonto } from '@/lib/calc/factura'
import type { FacturaCompra } from '@/types/database'

export function TotalesFactura({ factura }: { factura: FacturaCompra }) {
  const desgloseImpuestos = (factura.impuestos?.length ?? 0) > 0

  return (
    <div className="shell ml-auto w-72 rise">
      <div className="core flex flex-col gap-2 text-sm">
        <div className="flex justify-between text-ink-soft">
          <span>Subtotal</span>
          <span className="mono">{formatearMonto(factura.subtotal)}</span>
        </div>
        {!desgloseImpuestos && (
          <div className="flex justify-between text-ink-soft">
            <span>IVA</span>
            <span className="mono">{formatearMonto(factura.iva_total)}</span>
          </div>
        )}
        {factura.impuestos.map((imp) => (
          <div key={`${imp.tipo}-${imp.alicuota}`} className="flex justify-between text-ink-soft">
            <span>
              {imp.tipo}
              {imp.alicuota !== null && ` ${imp.alicuota}%`}
            </span>
            <span className="mono">{formatearMonto(imp.monto)}</span>
          </div>
        ))}
        {!desgloseImpuestos && factura.percepciones_total > 0 && (
          <div className="flex justify-between text-ink-soft">
            <span>Percepciones</span>
            <span className="mono">{formatearMonto(factura.percepciones_total)}</span>
          </div>
        )}
        {factura.ajuste_redondeo !== 0 && (
          <div className="flex justify-between text-ink-soft">
            <span>Ajuste por redondeo</span>
            <span className="mono">{formatearMonto(factura.ajuste_redondeo)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-line pt-2 font-semibold text-ink">
          <span>Total</span>
          <span className="mono">{formatearMonto(factura.total)}</span>
        </div>
      </div>
    </div>
  )
}
