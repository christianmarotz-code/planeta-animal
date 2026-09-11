import { describe, it, expect } from 'vitest'
import { calcularDimensionesRedimensionadas } from './redimensionarImagen'

describe('calcularDimensionesRedimensionadas', () => {
  it('no cambia una imagen que ya es más angosta que el máximo', () => {
    expect(calcularDimensionesRedimensionadas(1200, 800, 1600)).toEqual({ ancho: 1200, alto: 800 })
  })

  it('achica una imagen más ancha que el máximo, manteniendo la proporción', () => {
    expect(calcularDimensionesRedimensionadas(3200, 2400, 1600)).toEqual({ ancho: 1600, alto: 1200 })
  })

  it('redondea el alto resultante', () => {
    expect(calcularDimensionesRedimensionadas(3000, 1000, 1600)).toEqual({ ancho: 1600, alto: 533 })
  })

  it('deja igual una imagen exactamente del ancho máximo', () => {
    expect(calcularDimensionesRedimensionadas(1600, 900, 1600)).toEqual({ ancho: 1600, alto: 900 })
  })
})
