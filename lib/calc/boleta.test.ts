import { describe, it, expect } from 'vitest'
import { calcularBoleta, prorratear } from './boleta'

const l = (cantidad: number, precioLista: number, bon: number[], neto: number, iva = 21) => ({
  cantidad,
  precioLista,
  bonificaciones: bon,
  netoImpreso: neto,
  ivaAlicuota: iva,
  esRegalo: false,
})

describe('prorratear', () => {
  it('suma exacta con mayor resto', () => {
    expect(prorratear(100, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100)
  })
})

describe('Caso A — Nestlé 0395-00924054', () => {
  const r = calcularBoleta({
    lineas: [
      l(15, 1878.71, [25, 20], 15034.44),
      l(5, 27826.88, [14], 116065.92),
      l(12, 8396.49, [14], 84052.3),
      l(3, 22967.69, [14], 57478.93),
      l(12, 9781.92, [14], 97920.88),
      l(3, 29300.19, [14], 73326.67),
    ],
    iva: [{ alicuota: 21, monto: 93214.61 }],
    percepciones: [
      { nombre: 'IIBB 4%', monto: 17755.17 },
      { nombre: 'Perc. IVA 3%', monto: 13316.37 },
    ],
    totalImpreso: 568165.29,
  })
  it('cuadra con el total impreso', () => {
    expect(r.cuadra).toBe(true)
    expect(r.sumaLineas + r.ajusteRedondeo).toBeCloseTo(568165.29, 2)
  })
  it('totales por línea dentro de ±0,02', () => {
    const esperado = [19244.08, 148564.38, 107586.94, 73573.04, 125338.73, 93858.14]
    r.lineas.forEach((x, i) => expect(Math.abs(x.totalLinea - esperado[i])).toBeLessThanOrEqual(0.02))
  })
  it('precio final unitario línea 1', () => {
    expect(r.lineas[0].precioFinalUnitario).toBeCloseTo(1282.94, 1)
  })
})

describe('Caso B — Nestlé 0395-00926082', () => {
  it('precio final unitario 9.942,34', () => {
    const r = calcularBoleta({
      lineas: [l(12, 9311.25, [14], 93209.42)],
      iva: [{ alicuota: 21, monto: 19573.98 }],
      percepciones: [
        { nombre: 'IIBB 4%', monto: 3728.38 },
        { nombre: 'Perc. IVA 3%', monto: 2796.28 },
      ],
      totalImpreso: 119308.06,
    })
    expect(r.lineas[0].precioFinalUnitario).toBeCloseTo(9942.34, 2)
    expect(r.cuadra).toBe(true)
  })
})

describe('Caso C — ProfeVET sin percepciones', () => {
  it('cuadra y reproduce el total de línea', () => {
    const r = calcularBoleta({
      lineas: [
        l(10, 29446.28, [], 294462.8),
        l(20, 28828.1, [], 576562.0),
        l(30, 20279.34, [], 608380.2),
      ],
      iva: [{ alicuota: 21, monto: 310675.05 }],
      percepciones: [],
      totalImpreso: 1790080.05,
    })
    expect(r.cuadra).toBe(true)
    expect(Math.abs(r.lineas[0].totalLinea - 356299.99)).toBeLessThanOrEqual(0.02)
  })
})

describe('regalos y diferencias', () => {
  it('regalo queda en 0 y no se reparte sobre otras líneas', () => {
    const r = calcularBoleta({
      lineas: [
        { cantidad: 6, precioLista: 0, bonificaciones: [100], netoImpreso: null, ivaAlicuota: 21, esRegalo: true },
        l(1, 1000, [], 1000),
      ],
      iva: [{ alicuota: 21, monto: 210 }],
      percepciones: [],
      totalImpreso: 1210,
    })
    expect(r.lineas[0].totalLinea).toBe(0)
    expect(r.lineas[1].totalLinea).toBe(1210)
  })
  it('diferencia grande no cuadra', () => {
    const r = calcularBoleta({
      lineas: [l(1, 1000, [], 1000)],
      iva: [{ alicuota: 21, monto: 210 }],
      percepciones: [],
      totalImpreso: 1300,
    })
    expect(r.cuadra).toBe(false)
    expect(r.diferencia).toBe(90)
  })
})
