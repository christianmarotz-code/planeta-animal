'use client'

import { useRouter } from 'next/navigation'
import { crearServicio } from '@/lib/data/servicios'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import { ServicioForm } from '../ServicioForm'

export default function NuevoServicioPage() {
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
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-5 sm:p-8">
      <h1 className="rise text-[27px] text-ink">Nuevo servicio</h1>
      <ServicioForm
        submitLabel="Crear servicio"
        onSubmit={async (values) => {
          await crearServicio({
            nombre: values.nombre.trim(),
            categoria: values.categoria.trim() || null,
            rama: values.rama || null,
            precio: values.precio,
            activo: true,
          })
          router.push('/servicios')
        }}
      />
    </div>
  )
}
