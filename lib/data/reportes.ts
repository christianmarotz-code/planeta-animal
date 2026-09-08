import type { FacturaCompra, Proveedor, Producto } from '@/types/database'

export function calcularGastoPorProveedor(
  facturas: FacturaCompra[],
  proveedores: Proveedor[]
): { proveedor: string; total: number }[] {
  const totalesPorId = new Map<string, number>()
  for (const f of facturas) {
    if (f.estado === 'anulada') continue
    totalesPorId.set(f.proveedor_id, (totalesPorId.get(f.proveedor_id) ?? 0) + f.total)
  }
  return Array.from(totalesPorId.entries()).map(([proveedorId, total]) => ({
    proveedor: proveedores.find((p) => p.id === proveedorId)?.nombre ?? 'Desconocido',
    total,
  }))
}

export function calcularValorStock(productos: Producto[]): number {
  return productos.reduce((acc, p) => acc + p.stock_actual * p.costo_unitario_actual, 0)
}
