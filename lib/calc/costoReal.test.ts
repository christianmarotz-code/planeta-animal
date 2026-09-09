import { describe, it, expect } from 'vitest'
import { calcularFactorAjuste, calcularCostoRealUnitario } from './costoReal'

const sinAjustes = {
  aplicaIibb: false,
  tasaIibb: 4,
  aplicaPercIva: false,
  tasaPercIva: 3,
  descuentoProntoPago: 0,
}

describe('calcularFactorAjuste', () => {
  it('sin II.BB. ni percepción ni descuento, es solo el factor de IVA', () => {
    expect(calcularFactorAjuste(21, sinAjustes)).toBeCloseTo(1.21)
  })

  it('suma la tasa de II.BB. cuando aplica', () => {
    const config = { ...sinAjustes, aplicaIibb: true }
    expect(calcularFactorAjuste(21, config)).toBeCloseTo(1.25)
  })

  it('suma la tasa de percepción de IVA cuando aplica', () => {
    const config = { ...sinAjustes, aplicaPercIva: true }
    expect(calcularFactorAjuste(21, config)).toBeCloseTo(1.24)
  })

  it('suma II.BB. y percepción juntos', () => {
    const config = { ...sinAjustes, aplicaIibb: true, aplicaPercIva: true }
    expect(calcularFactorAjuste(21, config)).toBeCloseTo(1.28)
  })

  it('aplica el descuento por pronto pago multiplicativamente al final', () => {
    const config = { ...sinAjustes, aplicaIibb: true, descuentoProntoPago: 5 }
    expect(calcularFactorAjuste(21, config)).toBeCloseTo(1.25 * 0.95)
  })

  it('funciona con una alícuota de IVA distinta de 21%', () => {
    expect(calcularFactorAjuste(10.5, sinAjustes)).toBeCloseTo(1.105)
  })
})

describe('calcularCostoRealUnitario', () => {
  it('multiplica el costo neto por el factor de ajuste', () => {
    const config = { ...sinAjustes, aplicaIibb: true, descuentoProntoPago: 3.5 }
    const costoNeto = 1000
    const factor = calcularFactorAjuste(21, config)
    expect(calcularCostoRealUnitario(costoNeto, 21, config)).toBeCloseTo(costoNeto * factor)
  })

  it('sin ningún ajuste, es igual al costo neto por el factor de IVA solo', () => {
    expect(calcularCostoRealUnitario(1000, 21, sinAjustes)).toBeCloseTo(1210)
  })
})
