export interface TramoProntoPago {
  dias: number
  descuento: number
}

export function montoConDescuento(total: number, descuentoPct: number): number {
  return Math.round(total * (1 - descuentoPct / 100) * 100) / 100
}

/** Fecha límite (yyyy-mm-dd) para pagar dentro del tramo. */
export function fechaLimiteTramo(fechaFactura: string, dias: number): string {
  const d = new Date(`${fechaFactura}T00:00:00`)
  d.setDate(d.getDate() + dias)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Tramo elegido cuyo plazo ya pasó (null si no hay tramo elegido o sigue vigente). */
export function tramoVencido(
  tramos: TramoProntoPago[],
  elegido: number,
  fechaFactura: string,
  hoy: string = new Date().toLocaleDateString('en-CA')
): { tramo: TramoProntoPago; limite: string } | null {
  const tramo = tramos.find((t) => t.descuento === elegido)
  if (!tramo || elegido <= 0) return null
  const limite = fechaLimiteTramo(fechaFactura, tramo.dias)
  return hoy > limite ? { tramo, limite } : null
}
