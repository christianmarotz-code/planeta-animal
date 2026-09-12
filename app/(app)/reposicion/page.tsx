'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  listarReposicionSugerida,
  REPOSICION_DRAFT_KEY,
  type BorradorReposicion,
  type ItemReposicion,
  type PaqueteReposicion,
  type ReposicionSugerida,
} from '@/lib/data/reposicion'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import { SkeletonPage, SkeletonTable } from '@/components/Skeleton'

function calcularCantidad(item: ItemReposicion, cantidades: Record<string, string>): number {
  const crudo = cantidades[item.producto.id]
  if (crudo === undefined) return item.cantidadSugerida
  const valor = Number(crudo)
  return Number.isFinite(valor) && valor > 0 ? valor : item.cantidadSugerida
}

export default function ReposicionPage() {
  const esAdmin = useEsAdministrador()
  const router = useRouter()
  const [datos, setDatos] = useState<ReposicionSugerida | null>(null)
  const [cantidades, setCantidades] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listarReposicionSugerida()
      .then(setDatos)
      .catch(() => setDatos({ paquetes: [], sinPrecio: [] }))
      .finally(() => setLoading(false))
  }, [])

  if (esAdmin === null || loading || datos === null) {
    return (
      <SkeletonPage>
        <SkeletonTable filas={6} columnas={4} />
      </SkeletonPage>
    )
  }
  if (esAdmin === false) {
    return (
      <p className="p-8 text-sm text-negative">
        Acceso restringido — contactá a un administrador.
      </p>
    )
  }

  function handleCrearCompra(paquete: PaqueteReposicion) {
    const borrador: BorradorReposicion = {
      proveedorId: paquete.proveedor.id,
      items: paquete.items.map((item) => ({
        productoId: item.producto.id,
        cantidad: calcularCantidad(item, cantidades),
        costoUnitario: item.precio,
        alicuotaIva: item.producto.alicuota_iva,
      })),
    }
    sessionStorage.setItem(REPOSICION_DRAFT_KEY, JSON.stringify(borrador))
    router.push('/compras/nueva')
  }

  const sinDatos = datos.paquetes.length === 0 && datos.sinPrecio.length === 0

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="rise">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Gestión
        </p>
        <h1 className="mt-1 text-[27px] text-ink">Reposición sugerida</h1>
        <p className="mt-2 text-xs text-ink-faint">
          Los precios son los cargados en el comparador — verificá si tu proveedor los sube con o
          sin IVA antes de confirmar la compra.
        </p>
      </div>

      {sinDatos && (
        <div className="card rise p-5 text-sm text-ink-faint">
          No hay productos en stock bajo mínimo.
        </div>
      )}

      {datos.paquetes.map((paquete) => {
        const subtotalPaquete = paquete.items.reduce(
          (acc, item) => acc + item.precio * calcularCantidad(item, cantidades),
          0
        )
        return (
          <div key={paquete.proveedor.id} className="card rise overflow-x-auto">
            <div className="flex items-center justify-between px-5 py-3">
              <p className="text-sm font-semibold text-ink">{paquete.proveedor.nombre}</p>
              <button onClick={() => handleCrearCompra(paquete)} className="pill-btn">
                Crear compra con {paquete.proveedor.nombre}
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-line-strong text-left">
                  <th className="px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Producto
                  </th>
                  <th className="px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Cantidad sugerida
                  </th>
                  <th className="px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Precio unitario
                  </th>
                  <th className="px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Subtotal
                  </th>
                </tr>
              </thead>
              <tbody>
                {paquete.items.map((item) => {
                  const cantidad = calcularCantidad(item, cantidades)
                  return (
                    <tr key={item.producto.id} className="border-b border-line last:border-0">
                      <td className="px-5 py-2.5 text-ink">{item.producto.nombre}</td>
                      <td className="px-5 py-2.5">
                        <input
                          type="number"
                          min={1}
                          step="any"
                          value={cantidades[item.producto.id] ?? String(item.cantidadSugerida)}
                          onChange={(e) =>
                            setCantidades((prev) => ({ ...prev, [item.producto.id]: e.target.value }))
                          }
                          className="w-20 rounded-[var(--r-sm)] border border-line bg-surface p-1.5 text-sm text-ink outline-none focus:border-accent"
                        />
                      </td>
                      <td className="mono px-5 py-2.5 text-ink-soft">
                        ${item.precio.toLocaleString('es-AR')}
                      </td>
                      <td className="mono px-5 py-2.5 text-ink">
                        ${(item.precio * cantidad).toLocaleString('es-AR')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="px-5 py-2.5 text-right text-sm font-semibold text-ink">
              Total: ${subtotalPaquete.toLocaleString('es-AR')}
            </p>
          </div>
        )
      })}

      {datos.sinPrecio.length > 0 && (
        <div className="shell rise">
          <div className="core">
            <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Sin precio cargado
            </p>
            <ul className="divide-y divide-line">
              {datos.sinPrecio.map((producto) => (
                <li key={producto.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-ink">{producto.nombre}</span>
                  <span className="chip down">
                    {producto.stock_actual} / {producto.stock_minimo} {producto.unidad_stock}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href="/comparador"
              className="mt-3 inline-block text-xs font-semibold text-accent hover:underline"
            >
              Cargar precios en el comparador →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
