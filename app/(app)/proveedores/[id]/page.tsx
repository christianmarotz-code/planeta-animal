'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { obtenerProveedor, actualizarProveedor } from '@/lib/data/proveedores'
import { listarFacturas } from '@/lib/data/facturas'
import type { Proveedor, FacturaCompra } from '@/types/database'
import { ProveedorForm } from '../ProveedorForm'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'

export default function EditarProveedorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const esAdmin = useEsAdministrador()
  const [proveedor, setProveedor] = useState<Proveedor | null>(null)
  const [facturas, setFacturas] = useState<FacturaCompra[]>([])

  useEffect(() => {
    obtenerProveedor(id).then(setProveedor)
    listarFacturas({ proveedorId: id }).then(setFacturas)
  }, [id])

  if (!proveedor) return <p className="p-8 text-sm text-ink-soft">Cargando…</p>

  return (
    <div className="mx-auto flex max-w-md flex-col gap-8 p-5 sm:p-8 rise">
      <div>
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Gestión
        </p>
        <h1 className="mb-4 mt-1 text-[27px] text-ink">Editar proveedor</h1>
        <ProveedorForm
          initial={proveedor}
          esAdministrador={esAdmin === true}
          submitLabel="Guardar cambios"
          onSubmit={async (values) => {
            await actualizarProveedor(id, values)
            router.push('/proveedores')
          }}
        />
      </div>
      <div>
        <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Historial de compras
        </p>
        <div className="card divide-y divide-line">
          {facturas.map((f) => (
            <p key={f.id} className="px-5 py-3 text-sm text-ink">
              <span className="mono text-ink-faint">{f.fecha}</span> — {f.tipo_comprobante}{' '}
              {f.numero_comprobante}
              {esAdmin && (
                <>
                  {' '}
                  — <span className="mono font-semibold">${f.total.toLocaleString('es-AR')}</span>
                </>
              )}
            </p>
          ))}
          {facturas.length === 0 && (
            <p className="px-5 py-6 text-sm text-ink-faint">Sin compras aún.</p>
          )}
        </div>
      </div>
    </div>
  )
}
