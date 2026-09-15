export function calcularSubtotalItemVenta(cantidad: number, precioUnitario: number): number {
  return cantidad * precioUnitario
}

export function calcularTotalesVenta(
  items: { cantidad: number; precioUnitario: number }[]
): { subtotal: number; ivaTotal: number; total: number } {
  const subtotal = items.reduce(
    (acc, item) => acc + calcularSubtotalItemVenta(item.cantidad, item.precioUnitario),
    0
  )
  // Los precios de venta ya son finales (IVA incluido) en esta fase — no se
  // discrimina IVA por ítem como en las facturas de compra.
  return { subtotal, ivaTotal: 0, total: subtotal }
}

export interface ItemVentaMargen {
  tipo: 'producto' | 'servicio'
  cantidad: number
  precioUnitario: number
  costoUnitarioSnapshot: number | null
}

export function calcularMargenItemVenta(item: ItemVentaMargen): number {
  const ingreso = calcularSubtotalItemVenta(item.cantidad, item.precioUnitario)
  if (item.tipo === 'producto') {
    const costo = item.costoUnitarioSnapshot ?? 0
    return ingreso - item.cantidad * costo
  }
  return ingreso
}

export function calcularMargenTotalVenta(items: ItemVentaMargen[]): number {
  return items.reduce((acc, item) => acc + calcularMargenItemVenta(item), 0)
}
