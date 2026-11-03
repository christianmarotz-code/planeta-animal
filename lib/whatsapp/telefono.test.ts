import { describe, it, expect } from 'vitest'
import { normalizarTelefono, numeroParaEnviar } from './telefono'

describe('normalizarTelefono', () => {
  it('toma los dígitos de un JID y la clave de 8 dígitos', () => {
    expect(normalizarTelefono('5491112345678@s.whatsapp.net')).toEqual({
      digitos: '5491112345678',
      clave: '12345678',
    })
  })
  it('ignora el sufijo de dispositivo', () => {
    expect(normalizarTelefono('5491112345678:12@s.whatsapp.net')?.digitos).toBe('5491112345678')
  })
  it('rechaza lo que no parece un teléfono', () => {
    expect(normalizarTelefono('123')).toBeNull()
    expect(normalizarTelefono('status@broadcast')).toBeNull()
    expect(normalizarTelefono('1234567890123456')).toBeNull()
  })
})

describe('numeroParaEnviar', () => {
  it.each([
    ['+54 9 11 1234-5678', '5491112345678'],
    ['54 11 1234 5678', '5491112345678'],
    ['011 15 4444-5555', '5491144445555'],
    ['(0221) 15 555-1234', '5492215551234'],
    ['11 4444-5555', '5491144445555'],
  ])('convierte %s', (entrada, esperado) => {
    expect(numeroParaEnviar(entrada)).toBe(esperado)
  })
  it('devuelve null si no es un celular argentino reconocible', () => {
    expect(numeroParaEnviar('abc')).toBeNull()
    expect(numeroParaEnviar('')).toBeNull()
    expect(numeroParaEnviar('+1 415 555 2671')).toBeNull()
    expect(numeroParaEnviar('4444-5555')).toBeNull()
  })
})
