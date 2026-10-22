import Link from 'next/link'
import type { Producto } from '@/types/database'
import { esStockeable } from '@/lib/productos/stock'

export function FilaProducto({
  p,
  esAdmin,
  mostrarSubcategoria,
  confirmando,
  eliminando,
  onPedirConfirmacion,
  onCancelar,
  onEliminar,
}: {
  p: Producto
  esAdmin: boolean
  mostrarSubcategoria: boolean
  confirmando: boolean
  eliminando: boolean
  onPedirConfirmacion: () => void
  onCancelar: () => void
  onEliminar: () => void
}) {
  return (
    <tr className="border-b border-line transition last:border-0 hover:bg-accent/5">
      <td className="px-5 py-3">
        <Link href={`/productos/${p.id}`} className="font-medium text-ink hover:text-accent">
          {p.nombre}
        </Link>
      </td>
      <td className="px-5 py-3 text-ink-soft">
        {mostrarSubcategoria ? (p.subcategoria ?? <span className="text-ink-faint">—</span>) : p.categoria}
      </td>
      <td className="px-5 py-3">
        {p.stock_actual <= p.stock_minimo ? (
          <span className="chip down">
            {p.stock_actual} {p.unidad_stock}
          </span>
        ) : (
          <span className="mono text-ink">
            {p.stock_actual} {p.unidad_stock}
          </span>
        )}
        {esStockeable(p) && p.stock_minimo > 0 && (
          <span className="ml-2 text-xs text-ink-faint">mín. {p.stock_minimo}</span>
        )}
      </td>
      {esAdmin && (
        <>
          <td className="mono px-5 py-3 text-ink">
            ${p.costo_unitario_actual.toLocaleString('es-AR')}
          </td>
          <td className="whitespace-nowrap px-5 py-3 text-right">
            {confirmando ? (
              <span className="flex items-center justify-end gap-3 text-xs">
                <span className="text-ink-soft">
                  ¿Eliminar{p.stock_actual !== 0 ? ` (tiene ${p.stock_actual} en stock)` : ''}?
                </span>
                <button
                  type="button"
                  onClick={onEliminar}
                  disabled={eliminando}
                  className="font-semibold text-negative hover:underline disabled:opacity-50"
                >
                  {eliminando ? 'Eliminando…' : 'Sí, eliminar'}
                </button>
                <button type="button" onClick={onCancelar} className="text-ink-soft hover:text-ink">
                  Cancelar
                </button>
              </span>
            ) : (
              <span className="flex items-center justify-end gap-4 text-sm">
                <Link href={`/productos/${p.id}`} className="text-ink-soft hover:text-accent">
                  Editar
                </Link>
                <button type="button" onClick={onPedirConfirmacion} className="text-ink-soft hover:text-negative">
                  Eliminar
                </button>
              </span>
            )}
          </td>
        </>
      )}
    </tr>
  )
}
