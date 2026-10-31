import { describe, it, expect } from 'vitest'
import type { Gasto } from '@/types/database'
import { resumirGastosPorMes, totalesPorCategoria } from './meses'

const g = (fecha: string, monto: number, categoria = 'otro') => ({ fecha, monto, categoria }) as Gasto

describe('gastos por mes', () => {
  it('agrupa, ordena y calcula variación', () => {
    const r = resumirGastosPorMes([g('2026-07-03', 100), g('2026-08-05', 150), g('2026-08-20', 50)])
    expect(r.map((m) => m.mes)).toEqual(['2026-08', '2026-07'])
    expect(r[0]).toMatchObject({ cantidad: 2, total: 200, variacion: 100 })
    expect(r[1].variacion).toBeNull()
  })

  it('totaliza por categoría de mayor a menor', () => {
    const r = totalesPorCategoria([g('2026-08-01', 10, 'otro'), g('2026-08-02', 30, 'combustible'), g('2026-08-03', 5, 'otro')])
    expect(r).toEqual([
      { categoria: 'combustible', total: 30 },
      { categoria: 'otro', total: 15 },
    ])
  })
})
