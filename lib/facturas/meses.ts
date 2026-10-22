import type { FacturaCompra } from '@/types/database'

const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/** "2026-08" → "Agosto 2026". */
export function etiquetaMes(mes: string): string {
  const [anio, numero] = mes.split('-')
  const nombre = NOMBRES_MES[Number(numero) - 1]
  return nombre ? `${nombre} ${anio}` : mes
}

/** "2026-08-21" → "21/08/2026". */
export function formatearFechaCorta(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-')
  return `${dia}/${mes}/${anio}`
}

/** Primer y último día (yyyy-mm-dd) de un mes "yyyy-mm". */
export function rangoDelMes(mes: string): { desde: string; hasta: string } {
  const [anio, numero] = mes.split('-').map(Number)
  const ultimoDia = new Date(anio, numero, 0).getDate()
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimoDia).padStart(2, '0')}` }
}

export interface ResumenMes {
  mes: string
  etiqueta: string
  cantidad: number
  /** Suma de totales sin contar facturas anuladas. */
  total: number
  proveedores: number
  /** % de cambio del total contra el mes calendario anterior; null si ese mes no tiene facturas. */
  variacion: number | null
}

/** "2026-08" → "2026-07". */
function mesAnterior(mes: string): string {
  const [anio, numero] = mes.split('-').map(Number)
  const d = new Date(anio, numero - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const DIAS_ATRAS_SOSPECHOSO = 60

/**
 * Avisa si la fecha de una factura parece un error de tipeo: futura o muy vieja.
 * `hoy` es yyyy-mm-dd; devuelve null si la fecha es razonable.
 */
export function avisoFecha(fecha: string | null | undefined, hoy: string): string | null {
  if (!fecha) return null
  if (fecha > hoy) return 'La fecha es futura.'
  const dias = (Date.parse(hoy) - Date.parse(fecha)) / 86_400_000
  if (dias > DIAS_ATRAS_SOSPECHOSO) return `La fecha es de ${etiquetaMes(fecha.slice(0, 7))}, hace más de 2 meses.`
  return null
}

/** Agrupa por mes de la fecha de la factura, del más reciente al más antiguo. */
export function resumirPorMes(facturas: FacturaCompra[]): ResumenMes[] {
  const porMes = new Map<string, FacturaCompra[]>()
  for (const f of facturas) {
    const mes = f.fecha.slice(0, 7)
    porMes.set(mes, [...(porMes.get(mes) ?? []), f])
  }
  const totales = new Map<string, number>()
  for (const [mes, lista] of porMes) {
    totales.set(mes, lista.filter((f) => f.estado !== 'anulada').reduce((acc, f) => acc + f.total, 0))
  }
  return [...porMes.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([mes, lista]) => {
      const total = totales.get(mes) ?? 0
      const previo = totales.get(mesAnterior(mes))
      return {
        mes,
        etiqueta: etiquetaMes(mes),
        cantidad: lista.length,
        total,
        proveedores: new Set(lista.map((f) => f.proveedor_id)).size,
        variacion: previo ? ((total - previo) / previo) * 100 : null,
      }
    })
}
