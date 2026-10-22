'use client'

import { useState } from 'react'
import { mensajeDeError } from '@/lib/errores'
import { parsearPrecio } from '@/lib/comparador/parsearPrecio'
import { INPUT_CLASS } from './estilos'

interface ItemSinPrecio {
  precioId: string
  nombre: string
}

type Guardar = (precioId: string, cambios: { precio: number; nota: string | null }) => Promise<void>

function FilaSinPrecio({ item, onGuardar }: { item: ItemSinPrecio; onGuardar: Guardar }) {
  const [precioTexto, setPrecioTexto] = useState('')
  const [notaTexto, setNotaTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    const precio = parsearPrecio(precioTexto)
    if (precio === null) return setError('Ingresá un precio mayor a cero.')
    setGuardando(true)
    setError(null)
    try {
      // Al guardar, la fila sale de esta lista porque el producto ya tiene precio.
      await onGuardar(item.precioId, { precio, nota: notaTexto.trim() || null })
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar el precio. Intentá de nuevo.'))
      setGuardando(false)
    }
  }

  return (
    <li className="py-3">
      <form onSubmit={guardar} className="flex flex-wrap items-center gap-2">
        <span className="min-w-48 flex-1 text-sm font-medium text-ink">{item.nombre}</span>
        <input
          value={precioTexto}
          onChange={(e) => setPrecioTexto(e.target.value)}
          inputMode="decimal"
          placeholder="Precio"
          aria-label={`Precio de ${item.nombre}`}
          className={`${INPUT_CLASS} w-28`}
        />
        <input
          value={notaTexto}
          onChange={(e) => setNotaTexto(e.target.value)}
          maxLength={200}
          placeholder="Nota (opcional)"
          aria-label={`Nota de ${item.nombre}`}
          className={`${INPUT_CLASS} min-w-40 flex-1`}
        />
        <button type="submit" disabled={guardando} className="pill-btn disabled:opacity-50">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
      {error && <p className="mt-1 text-sm text-negative">{error}</p>}
    </li>
  )
}

export function SinPrecio({ items, onGuardar }: { items: ItemSinPrecio[]; onGuardar: Guardar }) {
  if (items.length === 0) return null
  return (
    <section className="card px-5 py-4">
      <h2 className="text-sm font-semibold text-ink">
        {items.length} {items.length === 1 ? 'producto sin precio' : 'productos sin precio'}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Están en la lista de este proveedor pero sin precio, así que no entran en las comparaciones. Escribí el
        precio de cada uno y guardalo.
      </p>
      <ul className="mt-2 max-h-80 divide-y divide-line overflow-y-auto">
        {items.map((item) => (
          <FilaSinPrecio key={item.precioId} item={item} onGuardar={onGuardar} />
        ))}
      </ul>
    </section>
  )
}
