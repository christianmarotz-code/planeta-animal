import { formatearMonto, type calcularTotalesFactura } from '@/lib/calc/factura'
import { TIPOS_COMPROBANTE, type ItemDraft } from '@/lib/facturas/itemDraft'
import type { Producto, Proveedor, TipoComprobante } from '@/types/database'

export function FormularioCorreccion({
  proveedores,
  productos,
  proveedorId,
  onProveedorId,
  tipoComprobante,
  onTipoComprobante,
  numeroComprobante,
  onNumeroComprobante,
  fecha,
  onFecha,
  items,
  creandoProductoIndices,
  totales,
  error,
  guardando,
  onActualizarItem,
  onAgregarItem,
  onQuitarItem,
  onCrearProductoRapido,
  onGuardar,
  onCancelar,
}: {
  proveedores: Proveedor[]
  productos: Producto[]
  proveedorId: string
  onProveedorId: (valor: string) => void
  tipoComprobante: TipoComprobante
  onTipoComprobante: (valor: TipoComprobante) => void
  numeroComprobante: string
  onNumeroComprobante: (valor: string) => void
  fecha: string
  onFecha: (valor: string) => void
  items: ItemDraft[]
  creandoProductoIndices: Set<number>
  totales: ReturnType<typeof calcularTotalesFactura>
  error: string | null
  guardando: boolean
  onActualizarItem: (index: number, patch: Partial<ItemDraft>) => void
  onAgregarItem: () => void
  onQuitarItem: (index: number) => void
  onCrearProductoRapido: (index: number, nombre: string) => void
  onGuardar: () => void
  onCancelar: () => void
}) {
  return (
    <div className="flex flex-col gap-5 rise">
      <p className="text-sm text-ink-faint">
        Corrigiendo esta factura: el stock que había sumado se revierte y se vuelve a aplicar con
        los datos nuevos al guardar.
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          required
          value={proveedorId}
          onChange={(e) => onProveedorId(e.target.value)}
          className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        >
          <option value="">Proveedor…</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <select
          value={tipoComprobante}
          onChange={(e) => onTipoComprobante(e.target.value as TipoComprobante)}
          className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        >
          {TIPOS_COMPROBANTE.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          required
          placeholder="Número de comprobante"
          value={numeroComprobante}
          onChange={(e) => onNumeroComprobante(e.target.value)}
          className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        />
        <input
          required
          type="date"
          value={fecha}
          onChange={(e) => onFecha(e.target.value)}
          className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        />
      </div>

      <table className="card w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-line-strong text-left">
            <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Producto</th>
            <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Cantidad</th>
            <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Costo unitario</th>
            <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">IVA %</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index} className="border-b border-line last:border-0">
              <td className="px-3 py-2 text-ink">
                <input
                  list="productos-list-edicion"
                  placeholder="Buscar o crear producto…"
                  value={item.productoTexto}
                  onChange={(e) => {
                    const texto = e.target.value
                    const match = productos.find((p) => p.nombre === texto)
                    onActualizarItem(index, {
                      productoTexto: texto,
                      producto_id: match?.id ?? '',
                      ...(match ? { alicuota_iva: String(match.alicuota_iva) } : {}),
                    })
                  }}
                  onBlur={() => {
                    const texto = item.productoTexto.trim()
                    const match = productos.find((p) => p.nombre === texto)
                    if (!match && texto.length > 2) {
                      onCrearProductoRapido(index, texto)
                    }
                  }}
                  className="w-full rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none transition focus:border-accent"
                />
                {creandoProductoIndices.has(index) && (
                  <p className="mt-1 text-xs text-ink-faint">Creando producto…</p>
                )}
              </td>
              <td className="px-3 py-2 text-ink">
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={item.cantidad}
                  onChange={(e) => onActualizarItem(index, { cantidad: e.target.value })}
                  className="w-20 rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none transition focus:border-accent"
                />
              </td>
              <td className="px-3 py-2 text-ink">
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={item.costo_unitario}
                  onChange={(e) => onActualizarItem(index, { costo_unitario: e.target.value })}
                  className="w-24 rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none transition focus:border-accent"
                />
              </td>
              <td className="px-3 py-2 text-ink">
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={item.alicuota_iva}
                  onChange={(e) => onActualizarItem(index, { alicuota_iva: e.target.value })}
                  className="w-16 rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none transition focus:border-accent"
                />
              </td>
              <td className="px-3 py-2 text-ink">
                <button type="button" onClick={() => onQuitarItem(index)} className="text-xs font-semibold text-negative hover:underline">
                  Quitar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <datalist id="productos-list-edicion">
        {productos.map((p) => (
          <option key={p.id} value={p.nombre} />
        ))}
      </datalist>

      <button type="button" onClick={onAgregarItem} className="pill-btn ghost w-fit">
        + Agregar ítem
      </button>

      <div className="shell ml-auto w-64">
        <div className="core flex flex-col gap-2 text-sm">
          <div className="flex justify-between text-ink-soft">
            <span>Subtotal</span>
            <span className="mono">{formatearMonto(totales.subtotal)}</span>
          </div>
          <div className="flex justify-between text-ink-soft">
            <span>IVA</span>
            <span className="mono">{formatearMonto(totales.ivaTotal)}</span>
          </div>
          <div className="flex justify-between border-t border-line pt-2 font-semibold text-ink">
            <span>Total</span>
            <span className="mono">{formatearMonto(totales.total)}</span>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-negative">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onGuardar}
          disabled={guardando || creandoProductoIndices.size > 0}
          className="pill-btn w-fit disabled:opacity-50"
        >
          {guardando
            ? 'Guardando…'
            : creandoProductoIndices.size > 0
              ? 'Creando producto…'
              : 'Guardar cambios'}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={guardando}
          className="pill-btn ghost w-fit disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
