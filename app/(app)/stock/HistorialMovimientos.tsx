import type { MovimientoStock, Producto } from '@/types/database'

const ETIQUETA_TIPO: Record<MovimientoStock['tipo'], string> = {
  entrada_compra: 'Entrada por compra',
  ajuste_manual: 'Ajuste manual',
  salida_venta: 'Salida por venta',
}

export function HistorialMovimientos({
  movimientos,
  productos,
  titulo = 'Historial de movimientos',
}: {
  movimientos: MovimientoStock[]
  /** Se usan para mostrar el nombre de cada producto. */
  productos: Producto[]
  titulo?: string
}) {
  return (
    <div className="shell rise">
      <div className="core">
        <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{titulo}</p>
        <ul className="divide-y divide-line">
          {movimientos.map((m) => {
            const producto = productos.find((p) => p.id === m.producto_id)
            return (
              <li key={m.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-ink">
                  <span className="mono text-ink-faint">{m.fecha}</span> — {producto?.nombre ?? '—'} —{' '}
                  {ETIQUETA_TIPO[m.tipo]}
                  {m.motivo && <span className="text-ink-faint"> ({m.motivo})</span>}
                </span>
                <span className={`chip ${m.cantidad >= 0 ? 'up' : 'down'}`}>
                  {m.cantidad >= 0 ? '+' : ''}
                  {m.cantidad}
                </span>
              </li>
            )
          })}
          {movimientos.length === 0 && <li className="py-2.5 text-sm text-ink-faint">Sin movimientos aún.</li>}
        </ul>
      </div>
    </div>
  )
}
