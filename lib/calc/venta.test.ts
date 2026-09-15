import { describe, it, expect } from 'vitest'
import {
  calcularSubtotalItemVenta,
  calcularTotalesVenta,
  calcularMargenItemVenta,
  calcularMargenTotalVenta,
} from './venta'

describe('calcularSubtotalItemVenta', () => {
  it('multiplies quantity by unit price', () => {
    expect(calcularSubtotalItemVenta(3, 500)).toBe(1500)
  })
})

describe('calcularTotalesVenta', () => {
  it('sums subtotal across items, IVA always 0 this phase', () => {
    const items = [
      { cantidad: 2, precioUnitario: 500 },
      { cantidad: 1, precioUnitario: 3000 },
    ]
    const result = calcularTotalesVenta(items)
    expect(result.subtotal).toBe(4000)
    expect(result.ivaTotal).toBe(0)
    expect(result.total).toBe(4000)
  })

  it('returns all zeros for an empty item list', () => {
    expect(calcularTotalesVenta([])).toEqual({ subtotal: 0, ivaTotal: 0, total: 0 })
  })
})

describe('calcularMargenItemVenta', () => {
  it('subtracts snapshotted cost for a producto item', () => {
    const margen = calcularMargenItemVenta({
      tipo: 'producto',
      cantidad: 3,
      precioUnitario: 1000,
      costoUnitarioSnapshot: 600,
    })
    expect(margen).toBe(1200) // (1000 - 600) * 3
  })

  it('treats the full price as margin for a servicio item', () => {
    const margen = calcularMargenItemVenta({
      tipo: 'servicio',
      cantidad: 2,
      precioUnitario: 5000,
      costoUnitarioSnapshot: null,
    })
    expect(margen).toBe(10000)
  })
})

describe('calcularMargenTotalVenta', () => {
  it('sums margin across mixed producto/servicio items', () => {
    const total = calcularMargenTotalVenta([
      { tipo: 'producto', cantidad: 3, precioUnitario: 1000, costoUnitarioSnapshot: 600 },
      { tipo: 'servicio', cantidad: 1, precioUnitario: 5000, costoUnitarioSnapshot: null },
    ])
    expect(total).toBe(1200 + 5000)
  })
})
