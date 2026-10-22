import type { BoletaExtraida, LineaExtraida } from '@/lib/facturas/boletaExtraida'
import type { BoletaProcesada } from '@/lib/facturas/procesarBoleta'
import type { Producto } from '@/types/database'
import { INPUT, TH, aNumero, fmt } from './formato'

export function TablaLineas({
  boleta,
  procesada,
  productos,
  productoIds,
  patchLinea,
  cambiarNombreProducto,
}: {
  boleta: BoletaExtraida
  procesada: BoletaProcesada
  productos: Producto[]
  productoIds: (string | null)[]
  patchLinea: (i: number, patch: Partial<LineaExtraida>) => void
  cambiarNombreProducto: (i: number, texto: string) => void
}) {
  return (
    <>
      <table className="card w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-line-strong">
            <th className={TH}>Cantidad</th>
            <th className={TH}>Producto</th>
            <th className={TH}>Precio unitario final</th>
            <th className={TH}>Total pagado</th>
          </tr>
        </thead>
        <tbody>
          {boleta.lineas.map((l, i) => (
            <tr key={i} className="border-b border-line">
              <td className="px-3 py-2">
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={l.cantidad ?? ''}
                  onChange={(e) => patchLinea(i, { cantidad: aNumero(e.target.value) })}
                  className={`${INPUT} w-20`}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  list="productos-carga"
                  value={l.descripcion_normalizada ?? l.descripcion}
                  onChange={(e) => cambiarNombreProducto(i, e.target.value)}
                  className={`${INPUT} w-full`}
                />
                <p className="mt-1 text-xs text-ink-faint">
                  {l.es_regalo && <span className="font-semibold text-positive">Regalo · </span>}
                  {productoIds[i] ? 'Vinculado al catálogo' : 'Sin producto vinculado'}
                </p>
              </td>
              <td className="mono px-3 py-2 text-ink">${fmt(procesada.filas[i].precioUnitarioFinal)}</td>
              <td className="mono px-3 py-2 font-semibold text-ink">${fmt(procesada.filas[i].totalPagado)}</td>
            </tr>
          ))}
          {procesada.calculo.ajusteRedondeo !== 0 && (
            <tr className="border-b border-line text-ink-soft">
              <td className="px-3 py-2" colSpan={3}>
                Ajuste de redondeo
              </td>
              <td className="mono px-3 py-2">${fmt(procesada.calculo.ajusteRedondeo)}</td>
            </tr>
          )}
          <tr className="font-semibold text-ink">
            <td className="px-3 py-3" colSpan={3}>
              TOTAL A PAGAR
            </td>
            <td className="mono px-3 py-3">${fmt(boleta.total ?? procesada.calculo.sumaLineas)}</td>
          </tr>
        </tbody>
      </table>
      <datalist id="productos-carga">
        {productos.map((p) => (
          <option key={p.id} value={p.nombre} />
        ))}
      </datalist>
    </>
  )
}

export function DetalleCompleto({
  boleta,
  procesada,
  patchLinea,
}: {
  boleta: BoletaExtraida
  procesada: BoletaProcesada
  patchLinea: (i: number, patch: Partial<LineaExtraida>) => void
}) {
  return (
    <details className="card p-3 text-sm">
      <summary className="cursor-pointer font-semibold text-ink">Detalle completo (lista, bonificaciones, IVA, percepciones)</summary>
      <div className="overflow-x-auto">
        <table className="mt-3 w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-line-strong">
              <th className={TH}>Producto</th>
              <th className={TH}>Lista</th>
              <th className={TH}>Bonif. %</th>
              <th className={TH}>Neto</th>
              <th className={TH}>IVA</th>
              <th className={TH}>Percep.</th>
              <th className={TH}>Total</th>
            </tr>
          </thead>
          <tbody>
            {boleta.lineas.map((l, i) => {
              const c = procesada.calculo.lineas[i]
              return (
                <tr key={i} className="border-b border-line">
                  <td className="px-3 py-2">{l.descripcion}</td>
                  <td className="mono px-3 py-2">{l.precio_lista !== null ? fmt(l.precio_lista) : '—'}</td>
                  <td className="mono px-3 py-2">
                    {l.bonificaciones.map((b) => b.porcentaje).filter((p) => p !== null).join(' + ') || '—'}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      value={l.importe ?? ''}
                      placeholder={fmt(c.neto)}
                      onChange={(e) => patchLinea(i, { importe: aNumero(e.target.value) })}
                      className={`${INPUT} w-28`}
                    />
                  </td>
                  <td className="mono px-3 py-2">{fmt(c.ivaMonto)}</td>
                  <td className="mono px-3 py-2">
                    {fmt(c.percepciones.reduce((a, p) => a + p.monto, 0))}
                  </td>
                  <td className="mono px-3 py-2">{fmt(c.totalLinea)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </details>
  )
}
