'use client'

import { useMemo, useState } from 'react'
import { mensajeDeError } from '@/lib/errores'
import { guardarPrecio } from '@/lib/data/preciosProveedor'
import { parsearPrecio } from '@/lib/comparador/parsearPrecio'
import type { Producto } from '@/types/database'
import { INPUT_CLASS } from './estilos'

export function FormularioPrecio({
  proveedorId,
  productos,
  productosConPrecio,
  onGuardado,
  onCancelar,
}: {
  proveedorId: string
  productos: Producto[]
  productosConPrecio: Set<string>
  onGuardado: () => Promise<void>
  onCancelar: () => void
}) {
  const [busqueda, setBusqueda] = useState('')
  const [producto, setProducto] = useState<Producto | null>(null)
  const [precioTexto, setPrecioTexto] = useState('')
  const [notaTexto, setNotaTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const coincidencias = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    if (producto || termino.length < 2) return []
    return productos.filter((p) => p.activo && p.nombre.toLowerCase().includes(termino)).slice(0, 8)
  }, [productos, busqueda, producto])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!producto) return setError('Elegí un producto de la lista.')
    const precio = parsearPrecio(precioTexto)
    if (precio === null) return setError('Ingresá un precio mayor a cero.')
    setGuardando(true)
    setError(null)
    try {
      await guardarPrecio({ proveedorId, productoId: producto.id, precio, nota: notaTexto.trim() || null })
      await onGuardado()
      setBusqueda('')
      setProducto(null)
      setPrecioTexto('')
      setNotaTexto('')
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar el precio. Intentá de nuevo.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="card flex flex-col gap-3 p-5">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Cargar un precio</p>

      <div className="flex flex-col gap-1">
        <input
          value={producto ? producto.nombre : busqueda}
          onChange={(e) => {
            setProducto(null)
            setBusqueda(e.target.value)
          }}
          placeholder="Buscar producto (al menos 2 letras)…"
          aria-label="Producto"
          className={`${INPUT_CLASS} w-full`}
        />
        {coincidencias.length > 0 && (
          <ul className="card divide-y divide-line">
            {coincidencias.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setProducto(p)}
                  className="w-full px-4 py-2 text-left text-sm text-ink hover:bg-accent/5"
                >
                  {p.nombre}
                </button>
              </li>
            ))}
          </ul>
        )}
        {producto && productosConPrecio.has(producto.id) && (
          <p className="text-sm text-ink-soft">Este proveedor ya tiene precio para este producto: se va a actualizar.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          value={precioTexto}
          onChange={(e) => setPrecioTexto(e.target.value)}
          inputMode="decimal"
          placeholder="Precio (por ejemplo 1.200,50)"
          aria-label="Precio"
          className={`${INPUT_CLASS} w-52`}
        />
        <input
          value={notaTexto}
          onChange={(e) => setNotaTexto(e.target.value)}
          maxLength={200}
          placeholder="Nota (por ejemplo: llevando 3, 10% de descuento)"
          aria-label="Nota"
          className={`${INPUT_CLASS} min-w-64 flex-1`}
        />
      </div>

      {error && <p className="text-sm text-negative">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={guardando} className="pill-btn disabled:opacity-50">
          {guardando ? 'Guardando…' : 'Guardar precio'}
        </button>
        <button type="button" onClick={onCancelar} className="text-sm text-ink-faint hover:text-ink">
          Cancelar
        </button>
      </div>
    </form>
  )
}
