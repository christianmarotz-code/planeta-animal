import { describe, expect, it } from 'vitest'
import { parsearPrecio } from './parsearPrecio'

describe('parsearPrecio', () => {
  it('acepta enteros y decimales con punto o coma', () => {
    expect(parsearPrecio('1200')).toBe(1200)
    expect(parsearPrecio('12.5')).toBe(12.5)
    expect(parsearPrecio('1,5')).toBe(1.5)
  })

  it('entiende el formato argentino con separador de miles', () => {
    expect(parsearPrecio('1.200')).toBe(1200)
    expect(parsearPrecio('1.200,50')).toBe(1200.5)
    expect(parsearPrecio('$ 1.350')).toBe(1350)
  })

  it('redondea a dos decimales', () => {
    expect(parsearPrecio('10,555')).toBe(10.56)
  })

  it('el signo de pesos y el formato argentino no dan cero (causa de los ceros de Bruncas)', () => {
    expect(parsearPrecio('$ 1.200,50')).toBe(1200.5)
    expect(parsearPrecio('$1.200,50')).toBe(1200.5)
  })

  it('un texto que no es un precio da null y no 0', () => {
    expect(parsearPrecio('USD 10')).toBeNull()
    expect(parsearPrecio('consultar')).toBeNull()
  })

  it('rechaza lo que no es un precio positivo', () => {
    expect(parsearPrecio('')).toBeNull()
    expect(parsearPrecio('   ')).toBeNull()
    expect(parsearPrecio('abc')).toBeNull()
    expect(parsearPrecio('0')).toBeNull()
    expect(parsearPrecio('-5')).toBeNull()
    expect(parsearPrecio('1.2.3')).toBeNull()
  })
})
