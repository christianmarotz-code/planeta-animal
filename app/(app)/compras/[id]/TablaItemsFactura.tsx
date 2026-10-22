import { calcularCostoRealUnitario } from '@/lib/calc/costoReal'
import { formatearMonto } from '@/lib/calc/factura'
import type { FacturaCompra, ItemFactura, Producto, Proveedor } from '@/types/database'

export function TablaItemsFactura({
  factura,
  items,
  proveedor,
  productosPorId,
  esAdmin,
  tieneDetalleInteligente,
}: {
  factura: FacturaCompra
  items: ItemFactura[]
  proveedor: Proveedor | null
  productosPorId: Map<string, Producto>
  esAdmin: boolean
  tieneDetalleInteligente: boolean
}) {
  return (
    <>
      <div className="card rise overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-line-strong text-left">
              <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                Producto
              </th>
              <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                Cantidad
              </th>
              {esAdmin && tieneDetalleInteligente && (
                <>
                  <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">Precio lista</th>
                  <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">Bonif.</th>
                </>
              )}
              {esAdmin && (
                <>
                  <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Costo neto
                  </th>
                  <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Costo real (con imp.)
                  </th>
                  <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Subtotal
                  </th>
                  {tieneDetalleInteligente && (
                    <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">Total línea</th>
                  )}
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const costoReal = proveedor
                ? calcularCostoRealUnitario(item.costo_unitario, item.alicuota_iva, {
                    aplicaIibb: proveedor.aplica_iibb,
                    tasaIibb: proveedor.tasa_iibb,
                    aplicaPercIva: proveedor.aplica_perc_iva,
                    tasaPercIva: proveedor.tasa_perc_iva,
                    descuentoProntoPago:
                      factura.pronto_pago.length > 0
                        ? factura.pronto_pago_elegido
                        : proveedor.descuento_pronto_pago,
                  })
                : null
              return (
                <tr key={item.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 text-ink">
                    {(item.producto_id && productosPorId.get(item.producto_id)?.nombre) || item.descripcion_original}
                    {item.es_regalo && <span className="chip ml-2">REGALO</span>}
                    {item.codigo_proveedor && (
                      <span className="mono block text-xs text-ink-faint">Cód. {item.codigo_proveedor}</span>
                    )}
                  </td>
                  <td className="mono px-5 py-3 text-ink">{item.cantidad}</td>
                  {esAdmin && tieneDetalleInteligente && (
                    <>
                      <td className="mono px-5 py-3 text-ink-soft">
                        {item.precio_lista !== null ? formatearMonto(item.precio_lista) : '—'}
                      </td>
                      <td className="mono px-5 py-3 text-ink-soft">
                        {item.bonificaciones?.length ? item.bonificaciones.map((b) => `${b}%`).join(' + ') : '—'}
                      </td>
                    </>
                  )}
                  {esAdmin && (
                    <>
                      <td className="mono px-5 py-3 text-ink-soft">
                        {formatearMonto(item.costo_unitario)}
                      </td>
                      <td className="mono px-5 py-3 font-semibold text-ink">
                        {costoReal !== null ? `${formatearMonto(costoReal)}` : '—'}
                      </td>
                      <td className="mono px-5 py-3 text-ink">{formatearMonto(item.subtotal)}</td>
                      {tieneDetalleInteligente && (
                        <td className="mono px-5 py-3 font-semibold text-ink">
                          {item.total_linea !== null ? formatearMonto(item.total_linea) : '—'}
                        </td>
                      )}
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {esAdmin &&
        proveedor &&
        (proveedor.aplica_iibb || proveedor.aplica_perc_iva || proveedor.descuento_pronto_pago > 0) && (
          <p className="text-xs text-ink-faint rise">
            Costo real = costo neto × (1 + IVA
            {proveedor.aplica_iibb && ` + II.BB. ${proveedor.tasa_iibb}%`}
            {proveedor.aplica_perc_iva && ` + Perc. IVA ${proveedor.tasa_perc_iva}%`}) ×{' '}
            {proveedor.descuento_pronto_pago > 0
              ? `(1 − ${proveedor.descuento_pronto_pago}% dto. pronto pago)`
              : '1'}{' '}
            — configurado en la ficha de {proveedor.nombre}.
          </p>
        )}
    </>
  )
}
