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

export function inicioSemana(fecha: Date): string {
  const d = new Date(fecha)
  const dia = d.getDay()
  const diff = d.getDate() - dia + (dia === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().slice(0, 10)
}

// facturas.fecha llega como 'YYYY-MM-DD'; parsearla con `new Date(string)` la
// interpreta como medianoche UTC, corriéndola un día hacia atrás en timezones
// negativos (ej. Argentina, UTC-3) y desplazando la factura al bucket semanal
// equivocado. Parsearla como fecha local evita ese corrimiento.
function parseFechaLocal(fecha: string): Date {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return new Date(anio, mes - 1, dia)
}

export function calcularGastoPorSemana(
  facturas: FacturaCompra[],
  semanas: number,
  hoy: Date = new Date()
): { semana: string; total: number }[] {
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
    const clave = inicioSemana(parseFechaLocal(f.fecha))
    if (totales.has(clave)) {
      totales.set(clave, (totales.get(clave) ?? 0) + f.total)
    }
  }
  return etiquetas.map((clave) => ({ semana: clave, total: totales.get(clave) ?? 0 }))
}

function claveMes(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
}

export function calcularGastoPorMes(
  facturas: FacturaCompra[],
  meses: number,
  hoy: Date = new Date()
): { mes: string; total: number }[] {
  const etiquetas: string[] = []
  const totales = new Map<string, number>()
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    const clave = claveMes(d)
    etiquetas.push(clave)
    totales.set(clave, 0)
  }
  for (const f of facturas) {
    if (f.estado === 'anulada') continue
    const clave = claveMes(parseFechaLocal(f.fecha))
    if (totales.has(clave)) {
      totales.set(clave, (totales.get(clave) ?? 0) + f.total)
    }
  }
  return etiquetas.map((clave) => ({ mes: clave, total: totales.get(clave) ?? 0 }))
}

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const ORDEN_LUNES_A_DOMINGO = [1, 2, 3, 4, 5, 6, 0] // índices de Date.getDay() (0 = domingo)

export function calcularGastoPorDiaSemana(
  facturas: FacturaCompra[],
  meses: number,
  hoy: Date = new Date()
): { dia: string; total: number }[] {
  const desde = new Date(hoy.getFullYear(), hoy.getMonth() - (meses - 1), 1)
  const totalesPorIndiceJs = [0, 0, 0, 0, 0, 0, 0]
  for (const f of facturas) {
    if (f.estado === 'anulada') continue
    const fecha = parseFechaLocal(f.fecha)
    if (fecha < desde || fecha > hoy) continue
    totalesPorIndiceJs[fecha.getDay()] += f.total
  }
  return ORDEN_LUNES_A_DOMINGO.map((indiceJs, i) => ({
    dia: DIAS_SEMANA[i],
    total: totalesPorIndiceJs[indiceJs],
  }))
}
