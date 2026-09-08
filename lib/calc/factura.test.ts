import { describe, it, expect } from 'vitest'
import {
  calcularSubtotalItem,
  calcularIvaItem,
  calcularTotalesFactura,
  convertirCantidadAUnidadStock,
  convertirCostoAUnidadStock,
} from './factura'

describe('calcularSubtotalItem', () => {
  it('multiplies quantity by unit cost', () => {
    expect(calcularSubtotalItem(3, 1500)).toBe(4500)
  })
})

describe('calcularIvaItem', () => {
  it('applies the IVA rate as a percentage', () => {
    expect(calcularIvaItem(4500, 21)).toBeCloseTo(945)
  })
  it('returns 0 for a 0% rate', () => {
    expect(calcularIvaItem(1000, 0)).toBe(0)
  })
})

describe('calcularTotalesFactura', () => {
  it('sums subtotal, IVA, and total across multiple items', () => {
    const items = [
      { cantidad: 3, costoUnitario: 1500, alicuotaIva: 21 },
      { cantidad: 2, costoUnitario: 500, alicuotaIva: 10.5 },
    ]
    const result = calcularTotalesFactura(items)
    expect(result.subtotal).toBe(5500)
    expect(result.ivaTotal).toBeCloseTo(945 + 105)
    expect(result.total).toBeCloseTo(5500 + 945 + 105)
  })

  it('returns all zeros for an empty item list', () => {
    expect(calcularTotalesFactura([])).toEqual({ subtotal: 0, ivaTotal: 0, total: 0 })
  })
})

describe('convertirCantidadAUnidadStock', () => {
  it('converts a fractionable product (1 box = 30 tablets)', () => {
    expect(convertirCantidadAUnidadStock(2, 30)).toBe(60)
  })
  it('leaves a non-fractionable product unchanged (factor 1)', () => {
    expect(convertirCantidadAUnidadStock(5, 1)).toBe(5)
  })
})

describe('convertirCostoAUnidadStock', () => {
  it('divides the purchase unit cost by the conversion factor', () => {
    expect(convertirCostoAUnidadStock(3000, 30)).toBe(100)
  })
  it('leaves a non-fractionable product unchanged (factor 1)', () => {
    expect(convertirCostoAUnidadStock(250, 1)).toBe(250)
  })
})
