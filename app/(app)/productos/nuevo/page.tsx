'use client'

import { useRouter } from 'next/navigation'
import { crearProducto } from '@/lib/data/productos'
import { ProductoForm } from '../ProductoForm'

export default function NuevoProductoPage() {
  const router = useRouter()
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Nuevo producto</h1>
      <ProductoForm
        submitLabel="Crear producto"
        onSubmit={async (values) => {
          await crearProducto({ ...values, activo: true })
          router.push('/productos')
        }}
      />
    </div>
  )
}
