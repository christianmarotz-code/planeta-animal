'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { obtenerProveedor, actualizarProveedor } from '@/lib/data/proveedores'
import { listarFacturas } from '@/lib/data/facturas'
import type { Proveedor, FacturaCompra } from '@/types/database'
import { ProveedorForm } from '../ProveedorForm'

export default function EditarProveedorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [proveedor, setProveedor] = useState<Proveedor | null>(null)
  const [facturas, setFacturas] = useState<FacturaCompra[]>([])

  useEffect(() => {
    obtenerProveedor(id).then(setProveedor)
    listarFacturas({ proveedorId: id }).then(setFacturas)
  }, [id])

  if (!proveedor) return <p>Cargando…</p>

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="mb-4 text-xl font-semibold">Editar proveedor</h1>
        <ProveedorForm
          initial={proveedor}
          submitLabel="Guardar cambios"
          onSubmit={async (values) => {
            await actualizarProveedor(id, values)
            router.push('/proveedores')
          }}
        />
      </div>
      <div>
        <h2 className="mb-2 font-semibold">Historial de compras</h2>
        <ul className="divide-y rounded border">
          {facturas.map((f) => (
            <li key={f.id} className="p-3">
              {f.fecha} — {f.tipo_comprobante} {f.numero_comprobante} — $
              {f.total.toLocaleString('es-AR')}
            </li>
          ))}
          {facturas.length === 0 && <li className="p-3 text-slate-500">Sin compras aún.</li>}
        </ul>
      </div>
    </div>
  )
}
