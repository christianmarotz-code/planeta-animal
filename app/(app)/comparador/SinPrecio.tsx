'use client'

export function SinPrecio({ items }: { items: { precioId: string; nombre: string }[] }) {
  if (items.length === 0) return null
  return (
    <details className="card px-5 py-4">
      <summary className="cursor-pointer text-sm font-semibold text-ink">
        {items.length} {items.length === 1 ? 'producto sin precio' : 'productos sin precio'}
      </summary>
      <p className="mt-2 text-sm text-ink-soft">
        Están en la lista de este proveedor pero sin precio, así que no entran en las comparaciones. Completalos
        con “+ Cargar precio”.
      </p>
      <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm text-ink sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.precioId}>{item.nombre}</li>
        ))}
      </ul>
    </details>
  )
}
