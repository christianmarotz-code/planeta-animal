import { describe, it, expect } from 'vitest'
import { etiquetaVinculo, nombreParaMostrar } from './presentacion'
import type { ConversacionConVinculo } from '@/lib/data/whatsapp'

function conversacion(sobre: Partial<ConversacionConVinculo> = {}): ConversacionConVinculo {
  return {
    id: 'c1',
    telefono: '5491112345678',
    clave: '12345678',
    nombre_whatsapp: null,
    proveedor_id: null,
    cliente_id: null,
    ultimo_mensaje_en: '2026-11-03T12:00:00Z',
    ultimo_texto: null,
    no_leidos: 0,
    creado_en: '2026-11-03T12:00:00Z',
    proveedor: null,
    cliente: null,
    ...sobre,
  }
}

describe('nombreParaMostrar', () => {
  it('prefiere el proveedor o cliente vinculado', () => {
    expect(nombreParaMostrar(conversacion({ proveedor: { id: 'p', nombre: 'Distribuidora Sur' } }))).toBe('Distribuidora Sur')
    expect(nombreParaMostrar(conversacion({ cliente: { id: 'k', nombre: 'Ana Pérez' } }))).toBe('Ana Pérez')
  })
  it('sigue con el nombre de WhatsApp y después con el teléfono', () => {
    expect(nombreParaMostrar(conversacion({ nombre_whatsapp: 'Ana' }))).toBe('Ana')
    expect(nombreParaMostrar(conversacion())).toBe('+54 9 11 1234-5678')
  })
})

describe('etiquetaVinculo', () => {
  it('nombra el tipo de vínculo', () => {
    expect(etiquetaVinculo(conversacion({ proveedor: { id: 'p', nombre: 'X' } }))).toBe('Proveedor')
    expect(etiquetaVinculo(conversacion({ cliente: { id: 'k', nombre: 'X' } }))).toBe('Cliente')
    expect(etiquetaVinculo(conversacion())).toBe('Sin vincular')
  })
})
