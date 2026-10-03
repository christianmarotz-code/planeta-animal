'use client'

import { fechaLimiteTramo, montoConDescuento, tramoVencido, type TramoProntoPago } from '@/lib/facturas/prontoPago'

function formatearFecha(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

interface Props {
  tramos: TramoProntoPago[]
  /** % del tramo elegido (0 = sin descuento). */
  elegido: number
  total: number
  fechaFactura: string
  onElegir: (descuento: number) => void
  deshabilitado?: boolean
}

export function SelectorProntoPago({ tramos, elegido, total, fechaFactura, onElegir, deshabilitado }: Props) {
  if (tramos.length === 0) return null
  const vencido = tramoVencido(tramos, elegido, fechaFactura)
  const opciones = [...tramos.map((t) => ({ ...t, etiqueta: `Hasta ${t.dias} días · ${t.descuento}%` })), { dias: 0, descuento: 0, etiqueta: 'Sin descuento' }]

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {opciones.map((op) => {
          const activo = op.descuento === elegido
          return (
            <button
              key={op.etiqueta}
              type="button"
              disabled={deshabilitado}
              onClick={() => onElegir(op.descuento)}
              className={`flex flex-col items-start rounded-[var(--r-sm)] border px-3 py-2 text-left text-sm transition disabled:opacity-50 ${
                activo ? 'border-accent bg-surface font-semibold text-ink' : 'border-line text-ink-soft hover:border-line-strong'
              }`}
            >
              <span>{op.etiqueta}</span>
              <span className="mono text-xs">${montoConDescuento(total, op.descuento).toLocaleString('es-AR')}</span>
              {op.dias > 0 && <span className="text-[11px] text-ink-faint">hasta el {formatearFecha(fechaLimiteTramo(fechaFactura, op.dias))}</span>}
            </button>
          )
        })}
      </div>
      {vencido && (
        <p className="text-sm text-negative">
          Venció el plazo del {vencido.tramo.descuento}% (hasta el {formatearFecha(vencido.limite)}). Si todavía no
          pagaste con ese descuento, elegí otro tramo para corregir el costo.
        </p>
      )}
    </div>
  )
}
