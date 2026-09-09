'use client'

import { useEffect, useState } from 'react'
import { listarFacturas } from '@/lib/data/facturas'
import { listarProveedores } from '@/lib/data/proveedores'
import { listarProductos } from '@/lib/data/productos'
import { calcularGastoPorProveedor, calcularValorStock } from '@/lib/data/reportes'
import type { FacturaCompra, Proveedor, Producto } from '@/types/database'

export default function ReportesPage() {
  const [facturas, setFacturas] = useState<FacturaCompra[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos, setProductos] = useState<Producto[]>([])

  useEffect(() => {
    listarFacturas().then(setFacturas)
    listarProveedores().then(setProveedores)
    listarProductos().then(setProductos)
  }, [])

  const gastoPorProveedor = calcularGastoPorProveedor(facturas, proveedores)
  const valorStock = calcularValorStock(productos)
  const productosStockBajo = productos.filter((p) => p.stock_actual <= p.stock_minimo)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="rise">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Gestión
        </p>
        <h1 className="mt-1 text-[27px] text-ink">Reportes</h1>
      </div>

      <div className="shell w-fit rise">
        <div className="core">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Valor total del stock actual
          </p>
          <p className="mono mt-2 text-[40px] font-medium leading-none text-ink">
            ${valorStock.toLocaleString('es-AR')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="shell rise">
          <div className="core">
            <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Gasto en compras por proveedor
            </p>
            <ul className="divide-y divide-line">
              {gastoPorProveedor.map((g) => (
                <li key={g.proveedor} className="flex justify-between py-2.5 text-sm">
                  <span className="text-ink">{g.proveedor}</span>
                  <span className="mono font-semibold text-ink">${g.total.toLocaleString('es-AR')}</span>
                </li>
              ))}
              {gastoPorProveedor.length === 0 && (
                <li className="py-2.5 text-sm text-ink-faint">Sin compras aún.</li>
              )}
            </ul>
          </div>
        </div>

        <div className="shell rise">
          <div className="core">
            <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Productos con stock bajo
            </p>
            <ul className="divide-y divide-line">
              {productosStockBajo.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-ink">{p.nombre}</span>
                  <span className="chip down">
                    {p.stock_actual} / {p.stock_minimo} {p.unidad_stock}
                  </span>
                </li>
              ))}
              {productosStockBajo.length === 0 && (
                <li className="py-2.5 text-sm text-ink-faint">Ningún producto está bajo el mínimo.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
