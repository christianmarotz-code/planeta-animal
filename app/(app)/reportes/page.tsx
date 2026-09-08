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
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Reportes</h1>

      <section>
        <h2 className="mb-2 font-semibold">Valor total del stock actual</h2>
        <p className="text-2xl">${valorStock.toLocaleString('es-AR')}</p>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Gasto en compras por proveedor</h2>
        <ul className="divide-y rounded border">
          {gastoPorProveedor.map((g) => (
            <li key={g.proveedor} className="flex justify-between p-2">
              <span>{g.proveedor}</span>
              <span>${g.total.toLocaleString('es-AR')}</span>
            </li>
          ))}
          {gastoPorProveedor.length === 0 && <li className="p-2 text-slate-500">Sin compras aún.</li>}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Productos con stock bajo</h2>
        <ul className="divide-y rounded border">
          {productosStockBajo.map((p) => (
            <li key={p.id} className="p-2">
              {p.nombre}: {p.stock_actual} {p.unidad_stock} (mínimo {p.stock_minimo})
            </li>
          ))}
          {productosStockBajo.length === 0 && (
            <li className="p-2 text-slate-500">Ningún producto está bajo el mínimo.</li>
          )}
        </ul>
      </section>
    </div>
  )
}
