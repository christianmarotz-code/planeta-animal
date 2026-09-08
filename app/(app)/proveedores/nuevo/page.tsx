'use client'

import { useRouter } from 'next/navigation'
import { crearProveedor } from '@/lib/data/proveedores'
import { ProveedorForm } from '../ProveedorForm'

export default function NuevoProveedorPage() {
  const router = useRouter()
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Nuevo proveedor</h1>
      <ProveedorForm
        submitLabel="Crear proveedor"
        onSubmit={async (values) => {
          await crearProveedor(values)
          router.push('/proveedores')
        }}
      />
    </div>
  )
}
