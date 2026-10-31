import type { Gasto } from '@/types/database'
import { etiquetaMes } from '@/lib/facturas/meses'

export interface ResumenMesGastos {
  mes: string
  etiqueta: string
  cantidad: number
  total: number
  /** % de cambio contra el mes calendario anterior; null si ese mes no tiene gastos. */
  variacion: number | null
}

function mesAnterior(mes: string): string {
  const [anio, numero] = mes.split('-').map(Number)
  const d = new Date(anio, numero - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Agrupa por mes de la fecha del gasto, del más reciente al más antiguo. */
export function resumirGastosPorMes(gastos: Gasto[]): ResumenMesGastos[] {
  const totales = new Map<string, number>()
  const cantidades = new Map<string, number>()
  for (const g of gastos) {
    const mes = g.fecha.slice(0, 7)
    totales.set(mes, (totales.get(mes) ?? 0) + g.monto)
    cantidades.set(mes, (cantidades.get(mes) ?? 0) + 1)
  }
  return [...totales.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map((mes) => {
      const total = totales.get(mes) ?? 0
      const previo = totales.get(mesAnterior(mes))
      return {
        mes,
        etiqueta: etiquetaMes(mes),
        cantidad: cantidades.get(mes) ?? 0,
        total,
        variacion: previo ? ((total - previo) / previo) * 100 : null,
      }
    })
}

/** Total por categoría, de mayor a menor. */
export function totalesPorCategoria(gastos: Gasto[]): { categoria: Gasto['categoria']; total: number }[] {
  const mapa = new Map<Gasto['categoria'], number>()
  for (const g of gastos) mapa.set(g.categoria, (mapa.get(g.categoria) ?? 0) + g.monto)
  return [...mapa.entries()].map(([categoria, total]) => ({ categoria, total })).sort((a, b) => b.total - a.total)
}
