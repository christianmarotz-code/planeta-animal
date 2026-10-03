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
}

/** Agrupa por mes de la fecha de la factura, del más reciente al más antiguo. */
export function resumirPorMes(facturas: FacturaCompra[]): ResumenMes[] {
  const porMes = new Map<string, FacturaCompra[]>()
  for (const f of facturas) {
    const mes = f.fecha.slice(0, 7)
    porMes.set(mes, [...(porMes.get(mes) ?? []), f])
  }
  return [...porMes.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([mes, lista]) => {
      const vigentes = lista.filter((f) => f.estado !== 'anulada')
      return {
        mes,
        etiqueta: etiquetaMes(mes),
        cantidad: lista.length,
        total: vigentes.reduce((acc, f) => acc + f.total, 0),
        proveedores: new Set(lista.map((f) => f.proveedor_id)).size,
      }
    })
}
