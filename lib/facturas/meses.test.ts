import { describe, it, expect } from 'vitest'
import type { FacturaCompra } from '@/types/database'
import { avisoFecha, etiquetaMes, rangoDelMes, resumirPorMes } from './meses'

const f = (fecha: string, total: number, proveedor_id = 'a', estado = 'cargada') =>
  ({ fecha, total, proveedor_id, estado }) as FacturaCompra

describe('meses', () => {
  it('etiqueta y rango', () => {
    expect(etiquetaMes('2026-08')).toBe('Agosto 2026')
    expect(rangoDelMes('2026-02')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' })
  })

  it('agrupa por mes, ordena del más nuevo y no suma anuladas', () => {
    const r = resumirPorMes([
      f('2026-08-21', 100),
      f('2026-09-14', 50, 'b'),
      f('2026-08-02', 200, 'b'),
      f('2026-08-05', 999, 'a', 'anulada'),
    ])
    expect(r.map((m) => m.mes)).toEqual(['2026-09', '2026-08'])
    expect(r[1]).toMatchObject({ cantidad: 3, total: 300, proveedores: 2 })
  })

  it('variación contra el mes calendario anterior', () => {
    const r = resumirPorMes([f('2026-09-01', 150), f('2026-08-01', 100), f('2026-06-01', 50)])
    expect(r.map((m) => m.variacion)).toEqual([50, null, null])
  })

  it('avisa de fechas futuras o muy viejas', () => {
    expect(avisoFecha('2026-10-22', '2026-10-22')).toBeNull()
    expect(avisoFecha('2026-09-01', '2026-10-22')).toBeNull()
    expect(avisoFecha('2026-11-01', '2026-10-22')).toMatch(/futura/)
    expect(avisoFecha('2025-06-10', '2026-10-22')).toMatch(/Junio 2025/)
    expect(avisoFecha(null, '2026-10-22')).toBeNull()
  })
})
