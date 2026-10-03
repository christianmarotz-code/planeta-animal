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
  const subtotalRedondeado = redondearCentavos(subtotal)
  const ivaRedondeado = redondearCentavos(ivaTotal)
  return {
    subtotal: subtotalRedondeado,
    ivaTotal: ivaRedondeado,
    total: redondearCentavos(subtotalRedondeado + ivaRedondeado),
  }
}

export function redondearCentavos(valor: number): number {
  return Math.round(valor * 100) / 100
}

/** Monto en pesos con separadores es-AR y siempre 2 decimales (ej. $1.234,50). */
export function formatearMonto(valor: number): string {
  return `$${valor.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
