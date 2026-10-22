'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { mensajeDeError } from '@/lib/errores'
import { actualizarPrecio, listarComparador, type FilaComparador } from '@/lib/data/preciosProveedor'
import { listarProductos } from '@/lib/data/productos'
import { listarProveedores } from '@/lib/data/proveedores'
import { planillaDeProveedor } from '@/lib/comparador/vistas'
import type { Producto, Proveedor } from '@/types/database'
import { SkeletonList } from '@/components/Skeleton'
import { INPUT_CLASS } from '../../estilos'
import { PlanillaProveedor } from '../../PlanillaProveedor'
import { FormularioPrecio } from '../../FormularioPrecio'

export default function PlanillaProveedorPage() {
  const { id } = useParams<{ id: string }>()
  const [filas, setFilas] = useState<FilaComparador[]>([])
  const [proveedor, setProveedor] = useState<Proveedor | null>(null)
  const [productos, setProductos] = useState<Producto[]>([])
  const [mostrandoFormulario, setMostrandoFormulario] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    const [filasCargadas, proveedores] = await Promise.all([listarComparador(), listarProveedores()])
    setFilas(filasCargadas)
    setProveedor(proveedores.find((p) => p.id === id) ?? null)
  }, [id])

  useEffect(() => {
    Promise.all([listarComparador(), listarProveedores()])
      .then(([filasCargadas, proveedores]) => {
        setFilas(filasCargadas)
        setProveedor(proveedores.find((p) => p.id === id) ?? null)
      })
      .catch((err) => setError(mensajeDeError(err, 'No se pudo cargar la planilla.')))
      .finally(() => setLoading(false))
  }, [id])

  async function abrirFormulario() {
    setMostrandoFormulario(true)
    if (productos.length > 0) return
    try {
      setProductos(await listarProductos())
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cargar la lista de productos.'))
    }
  }

  const planilla = useMemo(() => planillaDeProveedor(filas, id, busqueda), [filas, id, busqueda])
  const productosConPrecio = useMemo(
    () => new Set(planillaDeProveedor(filas, id).map((f) => f.producto.id)),
    [filas, id]
  )

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-5 sm:p-8">
        <SkeletonList filas={6} />
      </div>
    )
  }

  if (!proveedor) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-3 p-5 sm:p-8">
        <p className="text-sm text-negative">{error ?? 'No se encontró el proveedor.'}</p>
        <Link href="/comparador" className="text-sm text-accent hover:underline">
          Volver al comparador
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rise">
        <div>
          <Link href="/comparador" className="text-sm text-ink-faint hover:text-ink">
            ← Comparador
          </Link>
          <h1 className="mt-1 text-[27px] text-ink">{proveedor.nombre}</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/comparador/importar?proveedor=${proveedor.id}`} className="pill-btn">
            Importar lista
          </Link>
          <button type="button" onClick={abrirFormulario} className="pill-btn">
            + Cargar precio
          </button>
        </div>
      </div>

      {mostrandoFormulario && (
        <FormularioPrecio
          proveedorId={proveedor.id}
          productos={productos}
          productosConPrecio={productosConPrecio}
          onGuardado={recargar}
          onCancelar={() => setMostrandoFormulario(false)}
        />
      )}

      <input
        type="text"
        placeholder="Buscar producto en esta planilla…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className={`${INPUT_CLASS} w-full max-w-xs`}
      />

      {error && <p className="text-sm text-negative">{error}</p>}

      <PlanillaProveedor
        filas={planilla}
        onGuardar={async (precioId, cambios) => {
          await actualizarPrecio(precioId, cambios)
          await recargar()
        }}
      />
    </div>
  )
}
