'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listarFacturas } from '@/lib/data/facturas'
import { listarProveedores } from '@/lib/data/proveedores'
import { listarProductos } from '@/lib/data/productos'
import { calcularValorStock } from '@/lib/data/reportes'
import type { FacturaCompra, Proveedor, Producto } from '@/types/database'

function inicioSemana(fecha: Date): string {
  const d = new Date(fecha)
  const dia = d.getDay()
  const diff = d.getDate() - dia + (dia === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().slice(0, 10)
}

function gastoPorSemana(facturas: FacturaCompra[], semanas: number) {
  const hoy = new Date()
  const etiquetas: string[] = []
  const totales = new Map<string, number>()
  for (let i = semanas - 1; i >= 0; i--) {
    const d = new Date(hoy)
    d.setDate(d.getDate() - i * 7)
    const clave = inicioSemana(d)
    etiquetas.push(clave)
    totales.set(clave, 0)
  }
  for (const f of facturas) {
    if (f.estado === 'anulada') continue
    const clave = inicioSemana(new Date(f.fecha))
    if (totales.has(clave)) {
      totales.set(clave, (totales.get(clave) ?? 0) + f.total)
    }
  }
  return etiquetas.map((clave) => ({ semana: clave, total: totales.get(clave) ?? 0 }))
}

export default function DashboardPage() {
  const [facturas, setFacturas] = useState<FacturaCompra[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([listarFacturas(), listarProveedores(), listarProductos()])
      .then(([f, p, pr]) => {
        setFacturas(f)
        setProveedores(p)
        setProductos(pr)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p>Cargando…</p>

  const valorStock = calcularValorStock(productos)
  const hace30Dias = new Date()
  hace30Dias.setDate(hace30Dias.getDate() - 30)
  const facturasUltimos30 = facturas.filter(
    (f) => f.estado !== 'anulada' && new Date(f.fecha) >= hace30Dias
  )
  const gastoUltimos30 = facturasUltimos30.reduce((acc, f) => acc + f.total, 0)
  const productosStockBajo = productos.filter((p) => p.stock_actual <= p.stock_minimo)
  const ultimasFacturas = [...facturas]
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    .slice(0, 5)
  const semanas = gastoPorSemana(facturas, 6)
  const maxSemana = Math.max(1, ...semanas.map((s) => s.total))

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-brand-dark">Inicio</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5">
          <p className="text-sm text-slate-500">Valor total del stock</p>
          <p className="mt-1 text-2xl font-semibold text-brand-dark">
            ${valorStock.toLocaleString('es-AR')}
          </p>
        </div>
        <div className="rounded-2xl border bg-white p-5">
          <p className="text-sm text-slate-500">Gasto en compras (30 días)</p>
          <p className="mt-1 text-2xl font-semibold text-brand-dark">
            ${gastoUltimos30.toLocaleString('es-AR')}
          </p>
        </div>
        <div className="rounded-2xl border bg-white p-5">
          <p className="text-sm text-slate-500">Facturas cargadas</p>
          <p className="mt-1 text-2xl font-semibold text-brand-dark">{facturas.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5">
          <p className="mb-4 text-sm font-medium text-slate-700">Gasto por semana</p>
          <div className="flex h-32 items-end gap-3">
            {semanas.map((s) => (
              <div key={s.semana} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-brand-orange"
                  style={{ height: `${Math.max(4, (s.total / maxSemana) * 100)}%` }}
                  title={`$${s.total.toLocaleString('es-AR')}`}
                />
                <span className="text-[10px] text-slate-400">
                  {new Date(s.semana).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">Productos con stock bajo</p>
            <Link href="/stock" className="text-xs text-brand-orange hover:underline">
              Ver todo
            </Link>
          </div>
          <ul className="divide-y">
            {productosStockBajo.slice(0, 6).map((p) => (
              <li key={p.id} className="flex justify-between py-2 text-sm">
                <span>{p.nombre}</span>
                <span className="font-medium text-red-600">
                  {p.stock_actual} {p.unidad_stock}
                </span>
              </li>
            ))}
            {productosStockBajo.length === 0 && (
              <li className="py-2 text-sm text-slate-500">Ningún producto está bajo el mínimo.</li>
            )}
          </ul>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700">Últimas facturas</p>
          <Link href="/compras" className="text-xs text-brand-orange hover:underline">
            Ver todo
          </Link>
        </div>
        <ul className="divide-y">
          {ultimasFacturas.map((f) => {
            const proveedor = proveedores.find((p) => p.id === f.proveedor_id)
            return (
              <li key={f.id} className="flex justify-between py-2 text-sm">
                <span>
                  {f.fecha} — {proveedor?.nombre ?? '—'}
                  {f.estado === 'anulada' && <span className="ml-2 text-xs text-red-600">ANULADA</span>}
                </span>
                <span className="font-medium">${f.total.toLocaleString('es-AR')}</span>
              </li>
            )
          })}
          {ultimasFacturas.length === 0 && (
            <li className="py-2 text-sm text-slate-500">Sin facturas aún.</li>
          )}
        </ul>
      </div>
    </div>
  )
}
