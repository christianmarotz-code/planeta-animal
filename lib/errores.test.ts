import { describe, expect, it, vi } from 'vitest'
import { mensajeDeError } from './errores'

const FALLBACK = 'No se pudo guardar.'

describe('mensajeDeError', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})

  it('muestra el mensaje de una excepción de la base (P0001)', () => {
    const err = { code: 'P0001', message: 'La venta ya está anulada' }
    expect(mensajeDeError(err, FALLBACK)).toBe('La venta ya está anulada')
  })

  it('reconoce un error de Supabase aunque no sea instancia de Error', () => {
    const err = { code: 'P0001', message: 'Solo un administrador puede corregir una factura' }
    expect(err instanceof Error).toBe(false)
    expect(mensajeDeError(err, FALLBACK)).toContain('administrador')
  })

  it('traduce falta de permiso', () => {
    expect(mensajeDeError({ code: '42501', message: 'new row violates row-level security' }, FALLBACK)).toBe(
      'No tenés permiso para hacer esto.'
    )
  })

  it('traduce duplicados y registros en uso', () => {
    expect(mensajeDeError({ code: '23505', message: 'duplicate key' }, FALLBACK)).toMatch(/ya existe/i)
    expect(mensajeDeError({ code: '23503', message: 'foreign key' }, FALLBACK)).toMatch(/en uso/i)
  })

  it('avisa cuando no hay conexión', () => {
    expect(mensajeDeError(new TypeError('Failed to fetch'), FALLBACK)).toMatch(/conexión/i)
  })

  it('usa el mensaje de un Error propio (por ejemplo de nuestras APIs)', () => {
    expect(mensajeDeError(new Error('Datos inválidos'), FALLBACK)).toBe('Datos inválidos')
  })

  it('en un error desconocido agrega el detalle al mensaje de siempre', () => {
    expect(mensajeDeError({ code: 'XX000', message: 'algo raro' }, FALLBACK)).toBe(
      'No se pudo guardar. (algo raro)'
    )
  })

  it('devuelve el mensaje de siempre si no hay nada que mostrar', () => {
    expect(mensajeDeError(undefined, FALLBACK)).toBe(FALLBACK)
    expect(mensajeDeError('texto suelto', FALLBACK)).toBe(FALLBACK)
  })
})
