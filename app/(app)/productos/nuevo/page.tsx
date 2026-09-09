'use client'

import { useRouter } from 'next/navigation'
import { crearProducto } from '@/lib/data/productos'
import { ProductoForm } from '../ProductoForm'

export default function NuevoProductoPage() {
  const router = useRouter()
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 p-5 sm:p-8 rise">
      <div>
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Gestión
        </p>
        <h1 className="mt-1 text-[27px] text-ink">Nuevo producto</h1>
      </div>
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
