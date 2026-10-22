import Link from 'next/link'
import {
  calcularCapitalEnRiesgoPorRama,
  calcularGastoPorProveedorPorRama,
  calcularComprobantesPorRama,
} from '@/lib/data/reportes'
import type { UsuarioConEmail } from '@/lib/data/usuarios'
import type { FacturaCompra, ItemFactura, MovimientoStock, Producto, Proveedor, Rama } from '@/types/database'

export const NOMBRE_RAMA: Record<Rama, string> = { clinica: 'Clínica', petshop: 'Petshop' }
const NOMBRE_TIPO_MOVIMIENTO: Record<MovimientoStock['tipo'], string> = {
  entrada_compra: 'Entrada por compra',
  ajuste_manual: 'Ajuste manual',
  salida_venta: 'Salida por venta',
}

export function SeccionRama({
  rama,
  productos,
  facturasUltimos30,
  items,
  proveedores,
  movimientos,
  usuarios,
}: {
  rama: Rama
  productos: Producto[]
  facturasUltimos30: FacturaCompra[]
  items: ItemFactura[]
  proveedores: Proveedor[]
  movimientos: MovimientoStock[]
  usuarios: UsuarioConEmail[]
}) {
  const productosPorId = new Map(productos.map((p) => [p.id, p]))
  const capital = calcularCapitalEnRiesgoPorRama(productos)[rama]
  const topProveedores = calcularGastoPorProveedorPorRama(
    items,
    facturasUltimos30,
    productos,
    proveedores,
    rama
  ).slice(0, 3)
  const comprobantes = calcularComprobantesPorRama(items, facturasUltimos30, productos, rama)
  const usuariosPorId = new Map(usuarios.map((u) => [u.id, u.nombre]))
  const actividad = movimientos
    .filter((m) => productosPorId.get(m.producto_id)?.rama === rama)
    .slice(0, 5)

  return (
    <div className="glass-shell rise">
      <div className="glass-core flex flex-col gap-5">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
          {NOMBRE_RAMA[rama]}
        </p>

        <Link
          href="/stock"
          className="group -mx-1 flex flex-col gap-1 rounded-2xl px-1 py-1 no-underline transition-colors hover:bg-ink/5"
        >
          <div className="flex items-start justify-between">
            <p className="text-xs text-ink-soft transition-colors group-hover:text-accent">
              Capital en riesgo (stock bajo mínimo)
            </p>
            <span className="chip chip-on-glass down">{capital.cantidad} prod.</span>
          </div>
          <p className="mono text-xl font-medium text-ink">
            ${capital.valor.toLocaleString('es-AR')}
          </p>
        </Link>

        <div>
          <p className="mb-2 text-xs text-ink-soft">Top proveedores (30 días, neto)</p>
          <ul className="divide-y divide-line">
            {topProveedores.map((p) => {
              const proveedor = proveedores.find((pr) => pr.nombre === p.proveedor)
              const fila = (
                <div className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink">{p.proveedor}</span>
                  <span className="mono text-ink-soft">${p.total.toLocaleString('es-AR')}</span>
                </div>
              )
              return (
                <li key={p.proveedor}>
                  {proveedor ? (
                    <Link
                      href={`/proveedores/${proveedor.id}`}
                      className="-mx-1 block rounded-lg px-1 no-underline transition-colors hover:bg-ink/5"
                    >
                      {fila}
                    </Link>
                  ) : (
                    fila
                  )}
                </li>
              )
            })}
            {topProveedores.length === 0 && (
              <li className="py-2 text-sm text-ink-soft">Sin compras en los últimos 30 días.</li>
            )}
          </ul>
        </div>

        <div>
          <p className="mb-2 text-xs text-ink-soft">Comprobantes (30 días)</p>
          <ul className="divide-y divide-line">
            {comprobantes.map((c) => (
              <li key={c.tipo} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">
                  {c.tipo} <span className="text-ink-soft">({c.cantidad})</span>
                </span>
                <span className="mono text-ink-soft">${c.total.toLocaleString('es-AR')}</span>
              </li>
            ))}
            {comprobantes.length === 0 && (
              <li className="py-2 text-sm text-ink-soft">Sin comprobantes en los últimos 30 días.</li>
            )}
          </ul>
        </div>

        <div>
          <p className="mb-2 text-xs text-ink-soft">Actividad reciente</p>
          <ul className="divide-y divide-line">
            {actividad.map((m) => {
              const producto = productosPorId.get(m.producto_id)
              const contenido = (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-ink">{producto?.nombre ?? '—'}</span>
                    <span className="mono text-ink-soft">
                      {m.tipo === 'ajuste_manual' && m.cantidad > 0 ? '+' : ''}
                      {m.cantidad}
                    </span>
                  </div>
                  <p className="mono text-[11px] text-ink-faint">
                    {NOMBRE_TIPO_MOVIMIENTO[m.tipo]}
                    {m.usuario_id && usuariosPorId.get(m.usuario_id) ? ` · ${usuariosPorId.get(m.usuario_id)}` : ''}
                    {' · '}
                    {new Date(m.fecha).toLocaleDateString('es-AR')}
                  </p>
                </>
              )
              return (
                <li key={m.id} className="py-2 text-sm">
                  {producto ? (
                    <Link
                      href={`/productos/${producto.id}`}
                      className="-mx-1 block rounded-lg px-1 no-underline transition-colors hover:bg-ink/5"
                    >
                      {contenido}
                    </Link>
                  ) : (
                    contenido
                  )}
                </li>
              )
            })}
            {actividad.length === 0 && (
              <li className="py-2 text-sm text-ink-soft">Sin movimientos recientes.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}
