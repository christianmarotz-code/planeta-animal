import { describe, it, expect } from 'vitest'
import { normalizarTexto } from './normalizar'

describe('normalizarTexto', () => {
  it('pasa a minúsculas', () => {
    expect(normalizarTexto('Purina PRO PLAN')).toBe('purina pro plan')
  })

  it('quita acentos', () => {
    expect(normalizarTexto('Alimentación Balanceada')).toBe('alimentacion balanceada')
  })

  it('recorta espacios al borde y colapsa espacios repetidos', () => {
    expect(normalizarTexto('  Royal   Canin  ')).toBe('royal canin')
  })

  it('devuelve string vacío para input vacío', () => {
    expect(normalizarTexto('')).toBe('')
  })
})
