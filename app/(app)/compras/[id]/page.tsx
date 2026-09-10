'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { obtenerFacturaConItems, anularFactura } from '@/lib/data/facturas'
import { obtenerProveedor } from '@/lib/data/proveedores'
import { listarProductos } from '@/lib/data/productos'
import { calcularCostoRealUnitario } from '@/lib/calc/costoReal'
import type { FacturaCompra, ItemFactura, Proveedor, Producto } from '@/types/database'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'

export default function DetalleFacturaPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const esAdmin = useEsAdministrador()
  const [factura, setFactura] = useState<FacturaCompra | null>(null)
  const [items, setItems] = useState<ItemFactura[]>([])
  const [proveedor, setProveedor] = useState<Proveedor | null>(null)
  const [productos, setProductos] = useState<Producto[]>([])
  const [anulando, setAnulando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    obtenerFacturaConItems(id).then(({ factura, items }) => {
      setFactura(factura)
      setItems(items)
      obtenerProveedor(factura.proveedor_id).then(setProveedor)
    })
    listarProductos().then(setProductos)
  }, [id])

  if (!factura) return <p className="p-8 text-sm text-ink-soft">Cargando…</p>

  async function handleAnular() {
    if (!confirm('¿Anular esta factura? Se revertirá el stock que sumó.')) return
    setError(null)
    setAnulando(true)
    try {
      await anularFactura(id)
      router.refresh()
      const { factura: actualizada } = await obtenerFacturaConItems(id)
      setFactura(actualizada)
    } catch (err) {
      setError('No se pudo anular la factura. Intentá de nuevo.')
    } finally {
      setAnulando(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-5 sm:p-8">
      <div className="rise">
        <h1 className="flex items-center gap-2 text-[27px] text-ink">
          {factura.tipo_comprobante} {factura.numero_comprobante}
          {factura.estado === 'anulada' && <span className="chip down">ANULADA</span>}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {proveedor?.nombre} — <span className="mono">{factura.fecha}</span>
        </p>
      </div>

      <div className="card rise overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                Producto
              </th>
              <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                Cantidad
              </th>
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
                    descuentoProntoPago: proveedor.descuento_pronto_pago,
                  })
                : null
              return (
                <tr key={item.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 text-ink">
                    {productos.find((p) => p.id === item.producto_id)?.nombre}
                  </td>
                  <td className="mono px-5 py-3 text-ink">{item.cantidad}</td>
                  {esAdmin && (
                    <>
                      <td className="mono px-5 py-3 text-ink-soft">
                        ${item.costo_unitario.toLocaleString('es-AR')}
                      </td>
                      <td className="mono px-5 py-3 font-semibold text-ink">
                        {costoReal !== null ? `$${costoReal.toLocaleString('es-AR')}` : '—'}
                      </td>
                      <td className="mono px-5 py-3 text-ink">${item.subtotal.toLocaleString('es-AR')}</td>
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

      {esAdmin && (
        <div className="shell ml-auto w-72 rise">
          <div className="core flex flex-col gap-2 text-sm">
            <div className="flex justify-between text-ink-soft">
              <span>Subtotal</span>
              <span className="mono">${factura.subtotal.toLocaleString('es-AR')}</span>
            </div>
            <div className="flex justify-between text-ink-soft">
              <span>IVA</span>
              <span className="mono">${factura.iva_total.toLocaleString('es-AR')}</span>
            </div>
            <div className="flex justify-between border-t border-line pt-2 font-semibold text-ink">
              <span>Total</span>
              <span className="mono">${factura.total.toLocaleString('es-AR')}</span>
            </div>
          </div>
        </div>
      )}

      {factura.estado === 'cargada' && (
        <div className="rise">
          <button
            onClick={handleAnular}
            disabled={anulando}
            className="pill-btn ghost !text-negative disabled:opacity-50"
          >
            {anulando ? 'Anulando…' : 'Anular factura'}
          </button>
          {error && <p className="mt-2 text-sm text-negative">{error}</p>}
        </div>
      )}
    </div>
  )
}
