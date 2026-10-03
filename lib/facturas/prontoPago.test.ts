import { describe, it, expect } from 'vitest'
import { fechaLimiteTramo, montoConDescuento, tramoVencido } from './prontoPago'

const tramos = [
  { dias: 7, descuento: 5 },
  { dias: 14, descuento: 4 },
]

describe('prontoPago', () => {
  it('calcula los montos de la factura de Arcuri', () => {
    expect(montoConDescuento(121426.48, 5)).toBe(115355.16)
    expect(montoConDescuento(121426.48, 4)).toBe(116569.42)
    expect(montoConDescuento(121426.48, 0)).toBe(121426.48)
  })

  it('calcula la fecha límite del tramo', () => {
    expect(fechaLimiteTramo('2026-09-17', 7)).toBe('2026-09-24')
    expect(fechaLimiteTramo('2026-09-28', 7)).toBe('2026-10-05')
  })

  it('avisa solo cuando el tramo elegido ya venció', () => {
    expect(tramoVencido(tramos, 5, '2026-09-17', '2026-09-24')).toBeNull()
    expect(tramoVencido(tramos, 5, '2026-09-17', '2026-09-25')?.limite).toBe('2026-09-24')
    expect(tramoVencido(tramos, 0, '2026-09-17', '2026-12-01')).toBeNull()
  })
})
