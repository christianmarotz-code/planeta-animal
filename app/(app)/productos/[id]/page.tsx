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

  if (!producto) return <p>Cargando…</p>

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Editar producto</h1>
      <p className="mb-4 text-sm text-slate-500">
        Stock actual: {producto.stock_actual} {producto.unidad_stock} — Costo unitario: $
        {producto.costo_unitario_actual.toLocaleString('es-AR')}
      </p>
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
