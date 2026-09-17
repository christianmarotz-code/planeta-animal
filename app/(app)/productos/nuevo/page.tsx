'use client'

import { useRouter } from 'next/navigation'
import { crearProducto } from '@/lib/data/productos'
import { ProductoForm } from '../ProductoForm'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'

export default function NuevoProductoPage() {
  const esAdmin = useEsAdministrador()
  const router = useRouter()

  if (esAdmin === null) return <p className="p-8 text-sm text-ink-soft">Cargando…</p>
  if (esAdmin === false) {
    return (
      <p className="p-8 text-sm text-negative">
        Acceso restringido — contactá a un administrador.
      </p>
    )
  }

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
