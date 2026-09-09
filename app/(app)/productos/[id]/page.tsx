'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { obtenerProducto, actualizarProducto } from '@/lib/data/productos'
import type { Producto } from '@/types/database'
import { ProductoForm } from '../ProductoForm'

export default function EditarProductoPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [producto, setProducto] = useState<Producto | null>(null)

  useEffect(() => {
    obtenerProducto(id).then(setProducto)
  }, [id])

  if (!producto) return <p className="p-8 text-sm text-ink-soft">Cargando…</p>

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-5 sm:p-8 rise">
      <div>
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Gestión
        </p>
        <h1 className="mt-1 text-[27px] text-ink">Editar producto</h1>
      </div>
      <div className="chip up mb-2 w-fit">
        Stock: {producto.stock_actual} {producto.unidad_stock} · Costo: $
        {producto.costo_unitario_actual.toLocaleString('es-AR')}
      </div>
      <ProductoForm
        initial={producto}
        submitLabel="Guardar cambios"
        onSubmit={async (values) => {
          await actualizarProducto(id, values)
          router.push('/productos')
        }}
      />
    </div>
  )
}
