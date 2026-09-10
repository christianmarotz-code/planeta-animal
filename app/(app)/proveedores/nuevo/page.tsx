'use client'

import { useRouter } from 'next/navigation'
import { crearProveedor } from '@/lib/data/proveedores'
import { ProveedorForm } from '../ProveedorForm'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'

export default function NuevoProveedorPage() {
  const esAdmin = useEsAdministrador()
  const router = useRouter()
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 p-5 sm:p-8 rise">
      <div>
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Gestión
        </p>
        <h1 className="mt-1 text-[27px] text-ink">Nuevo proveedor</h1>
      </div>
      <ProveedorForm
        esAdministrador={esAdmin === true}
        submitLabel="Crear proveedor"
        onSubmit={async (values) => {
          await crearProveedor(values)
          router.push('/proveedores')
        }}
      />
    </div>
  )
}
