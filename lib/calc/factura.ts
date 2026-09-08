export function calcularSubtotalItem(cantidad: number, costoUnitario: number): number {
  return cantidad * costoUnitario
}

export function calcularIvaItem(subtotalItem: number, alicuotaIva: number): number {
  return subtotalItem * (alicuotaIva / 100)
}

export function calcularTotalesFactura(
  items: { cantidad: number; costoUnitario: number; alicuotaIva: number }[]
): { subtotal: number; ivaTotal: number; total: number } {
  let subtotal = 0
  let ivaTotal = 0
  for (const item of items) {
    const subtotalItem = calcularSubtotalItem(item.cantidad, item.costoUnitario)
    subtotal += subtotalItem
    ivaTotal += calcularIvaItem(subtotalItem, item.alicuotaIva)
  }
  return { subtotal, ivaTotal, total: subtotal + ivaTotal }
}

export function convertirCantidadAUnidadStock(
  cantidadCompra: number,
  factorConversion: number
): number {
  return cantidadCompra * factorConversion
}

export function convertirCostoAUnidadStock(
  costoUnitarioCompra: number,
  factorConversion: number
): number {
  return costoUnitarioCompra / factorConversion
}
