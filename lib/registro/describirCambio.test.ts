import { describe, expect, it } from 'vitest'
import type { RegistroCambio } from '@/types/database'
import { describirCambio } from './describirCambio'

const base: RegistroCambio = {
  id: '1',
  creado_en: '2026-10-22T16:00:00Z',
  usuario_id: 'u1',
  usuario_nombre: 'Nacho',
  tabla: 'precios_proveedor',
  registro_id: 'r1',
  operacion: 'update',
  proveedor_id: 'p1',
  detalle: {},
}

describe('describirCambio', () => {
  it('precio cargado por primera vez', () => {
    const r = { ...base, operacion: 'insert' as const, detalle: { producto: 'Abbocath N°14', precio_anterior: null, precio_nuevo: 1200 } }
    expect(describirCambio(r)).toBe('Cargó el precio de Abbocath N°14: $1.200')
  })

  it('precio modificado', () => {
    const r = { ...base, detalle: { producto: 'Abbocath N°14', precio_anterior: 1200, precio_nuevo: 1350 } }
    expect(describirCambio(r)).toBe('Cambió el precio de Abbocath N°14: $1.200 → $1.350')
  })

  it('precio borrado, con producto desconocido', () => {
    const r = { ...base, operacion: 'delete' as const, detalle: { producto: null, precio_anterior: 500, precio_nuevo: null } }
    expect(describirCambio(r)).toBe('Borró el precio de un producto ($500)')
  })

  it('precio cargado con nota de promoción', () => {
    const r = {
      ...base,
      operacion: 'insert' as const,
      detalle: { producto: 'Abbocath N°14', precio_anterior: null, precio_nuevo: 1200, nota_anterior: null, nota_nueva: 'Llevando 3, 10% de descuento' },
    }
    expect(describirCambio(r)).toBe('Cargó el precio de Abbocath N°14: $1.200 — nota: «Llevando 3, 10% de descuento»')
  })

  it('solo cambió la nota', () => {
    const r = {
      ...base,
      detalle: { producto: 'Abbocath N°14', precio_anterior: 1200, precio_nuevo: 1200, nota_anterior: null, nota_nueva: '3x2 hasta fin de mes' },
    }
    expect(describirCambio(r)).toBe('Cambió la nota de Abbocath N°14: — → «3x2 hasta fin de mes»')
  })

  it('cambió el precio y la nota', () => {
    const r = {
      ...base,
      detalle: { producto: 'Abbocath N°14', precio_anterior: 1200, precio_nuevo: 1100, nota_anterior: 'Promo vieja', nota_nueva: 'Promo nueva' },
    }
    expect(describirCambio(r)).toBe('Cambió el precio de Abbocath N°14: $1.200 → $1.100 y la nota («Promo vieja» → «Promo nueva»)')
  })

  it('cambió solo el precio y la nota quedó igual', () => {
    const r = {
      ...base,
      detalle: { producto: 'Abbocath N°14', precio_anterior: 1200, precio_nuevo: 1350, nota_anterior: 'Igual', nota_nueva: 'Igual' },
    }
    expect(describirCambio(r)).toBe('Cambió el precio de Abbocath N°14: $1.200 → $1.350')
  })

  it('proveedor creado y borrado', () => {
    const creado = { ...base, tabla: 'proveedores' as const, operacion: 'insert' as const, detalle: { nombre: 'Distribuidora Sur' } }
    const borrado = { ...creado, operacion: 'delete' as const }
    expect(describirCambio(creado)).toBe('Creó el proveedor Distribuidora Sur')
    expect(describirCambio(borrado)).toBe('Borró el proveedor Distribuidora Sur')
  })

  it('proveedor editado: nombra los campos con su etiqueta y formatea los valores', () => {
    const r = {
      ...base,
      tabla: 'proveedores' as const,
      detalle: {
        telefono: { antes: null, despues: '11 5555-1234' },
        activo: { antes: true, despues: false },
      },
    }
    expect(describirCambio(r)).toBe('Editó: Teléfono (— → 11 5555-1234), Activo (Sí → No)')
  })
})
