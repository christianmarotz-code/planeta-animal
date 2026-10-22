import Link from 'next/link'
import type { Producto } from '@/types/database'
import type { EstadoStock, OrdenProductos } from '@/lib/productos/stock'

export const TOP_RESUMEN = 5

export interface ResumenStockDatos {
  reponer: Producto[]
  masStock: Producto[]
  sinStock: number
  negativos: number
  conStock: number
}

export function ResumenStock({
  resumen,
  esAdmin,
  onVerSoloEsto,
}: {
  resumen: ResumenStockDatos
  esAdmin: boolean
  onVerSoloEsto: (estado: EstadoStock, orden: OrdenProductos) => void
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 rise">
      <section className="card p-5" aria-label="Productos a reponer">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-ink">A reponer</h2>
          <span className="chip down">{resumen.reponer.length}</span>
        </div>
        <p className="mt-0.5 text-xs text-ink-faint">Con stock en su mínimo o por debajo</p>
        {resumen.reponer.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">Nada para reponer por ahora.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5 text-sm">
            {resumen.reponer.slice(0, TOP_RESUMEN).map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-3">
                <Link href={`/productos/${p.id}`} className="truncate text-ink hover:text-accent">
                  {p.nombre}
                </Link>
                <span className="mono shrink-0 text-xs text-ink-soft">
                  {p.stock_actual} / mín. {p.stock_minimo}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
          {resumen.reponer.length > TOP_RESUMEN && (
            <button
              type="button"
              onClick={() => onVerSoloEsto('reponer', 'urgente')}
              className="font-medium text-accent hover:underline"
            >
              Ver los {resumen.reponer.length}
            </button>
          )}
          {esAdmin && (
            <Link href="/reposicion" className="text-ink-soft hover:text-accent">
              Armar pedido de reposición
            </Link>
          )}
        </div>
      </section>

      <section className="card p-5" aria-label="Productos con más stock">
        <h2 className="text-[15px] font-semibold text-ink">Más stock</h2>
        <p className="mt-0.5 text-xs text-ink-faint">Sin contar servicios</p>
        <ul className="mt-3 flex flex-col gap-1.5 text-sm">
          {resumen.masStock.map((p) => (
            <li key={p.id} className="flex items-baseline justify-between gap-3">
              <Link href={`/productos/${p.id}`} className="truncate text-ink hover:text-accent">
                {p.nombre}
              </Link>
              <span className="mono shrink-0 text-xs text-ink-soft">
                {p.stock_actual} {p.unidad_stock}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
          <button
            type="button"
            onClick={() => onVerSoloEsto('con_stock', 'mas_stock')}
            className="font-medium text-accent hover:underline"
          >
            Ver ranking completo
          </button>
          <button
            type="button"
            onClick={() => onVerSoloEsto('sin_stock', 'nombre')}
            className="text-ink-soft hover:text-accent"
          >
            Sin stock ({resumen.sinStock})
          </button>
          {resumen.negativos > 0 && (
            <button
              type="button"
              onClick={() => onVerSoloEsto('negativo', 'menos_stock')}
              className="text-ink-soft hover:text-negative"
            >
              Stock negativo ({resumen.negativos})
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
