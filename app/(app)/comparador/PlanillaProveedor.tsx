'use client'

import { useState } from 'react'
import { mensajeDeError } from '@/lib/errores'
import { esPrecioViejo, type Comparacion, type FilaPlanilla } from '@/lib/comparador/vistas'
import { parsearPrecio } from '@/lib/comparador/parsearPrecio'
import { formatearFechaCorta } from '@/lib/facturas/meses'
import { INPUT_CLASS } from './estilos'

const TH = 'px-4 py-3 text-left text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint'

function textoComparacion(c: Comparacion): { texto: string; clase: string } {
  if (c.tipo === 'mas_barato') return { texto: 'El más barato', clase: 'chip up' }
  if (c.tipo === 'mas_caro') return { texto: `${c.porcentaje} % más caro que ${c.contra}`, clase: 'text-negative' }
  return { texto: 'Solo este proveedor', clase: 'text-ink-faint' }
}

export function PlanillaProveedor({
  filas,
  onGuardar,
}: {
  filas: FilaPlanilla[]
  onGuardar: (precioId: string, cambios: { precio: number; nota: string | null }) => Promise<void>
}) {
  const [hoy] = useState(() => new Date())
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [precioTexto, setPrecioTexto] = useState('')
  const [notaTexto, setNotaTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  function empezarEdicion(fila: FilaPlanilla) {
    setEditandoId(fila.precioId)
    setPrecioTexto(String(fila.precio).replace('.', ','))
    setNotaTexto(fila.nota ?? '')
    setError(null)
  }

  async function guardar(fila: FilaPlanilla) {
    const precio = parsearPrecio(precioTexto)
    if (precio === null) return setError('Ingresá un precio mayor a cero.')
    setGuardando(true)
    setError(null)
    try {
      await onGuardar(fila.precioId, { precio, nota: notaTexto.trim() || null })
      setEditandoId(null)
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar el precio. Intentá de nuevo.'))
    } finally {
      setGuardando(false)
    }
  }

  if (filas.length === 0) {
    return <p className="card px-5 py-6 text-sm text-ink-faint">No hay precios que mostrar.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-line-strong">
              <th className={TH}>Producto</th>
              <th className={TH}>Precio</th>
              <th className={TH}>Nota</th>
              <th className={TH}>Comparado con otros</th>
              <th className={TH}>Actualizado</th>
              <th className={TH}></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => {
              const editando = editandoId === fila.precioId
              const comparacion = textoComparacion(fila.comparacion)
              const viejo = esPrecioViejo(fila.actualizadoEn, hoy)
              return (
                <tr key={fila.precioId} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{fila.producto.nombre}</td>
                  {editando ? (
                    <>
                      <td className="px-4 py-2">
                        <input
                          value={precioTexto}
                          onChange={(e) => setPrecioTexto(e.target.value)}
                          inputMode="decimal"
                          aria-label="Precio"
                          className={`${INPUT_CLASS} w-28`}
                        />
                      </td>
                      <td className="px-4 py-2" colSpan={3}>
                        <input
                          value={notaTexto}
                          onChange={(e) => setNotaTexto(e.target.value)}
                          maxLength={200}
                          placeholder="Nota (por ejemplo: llevando 3, 10% de descuento)"
                          aria-label="Nota"
                          className={`${INPUT_CLASS} w-full`}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <button type="button" disabled={guardando} onClick={() => guardar(fila)} className="pill-btn disabled:opacity-50">
                            Guardar
                          </button>
                          <button type="button" onClick={() => setEditandoId(null)} className="text-sm text-ink-faint hover:text-ink">
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="mono px-4 py-3 font-semibold text-ink">${fila.precio.toLocaleString('es-AR')}</td>
                      <td className="px-4 py-3 text-ink-soft">{fila.nota ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={comparacion.clase}>{comparacion.texto}</span>
                      </td>
                      <td className={`px-4 py-3 ${viejo ? 'text-negative' : 'text-ink-faint'}`}>
                        {formatearFechaCorta(fila.actualizadoEn.slice(0, 10))}
                        {viejo && ' · revisar'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => empezarEdicion(fila)} className="text-sm font-semibold text-accent hover:underline">
                          Editar
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {error && <p className="text-sm text-negative">{error}</p>}
    </div>
  )
}
