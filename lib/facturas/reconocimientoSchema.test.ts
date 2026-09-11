import { describe, it, expect } from 'vitest'
import { sanearFacturaDetectada } from './reconocimientoSchema'

describe('sanearFacturaDetectada', () => {
  it('sanea una respuesta completa y válida', () => {
    const resultado = sanearFacturaDetectada({
      proveedor_nombre: 'Distribuidora Central S.A.',
      proveedor_cuit: '30-71234567-8',
      tipo_comprobante: 'Factura A',
      numero_comprobante: '0001-00012345',
      fecha: '2026-09-10',
      items: [
        { descripcion: 'Balanceado Perro Adulto 15kg', cantidad: 10, costo_unitario: 25000, alicuota_iva: 21 },
      ],
      subtotal: 250000,
      iva_total: 52500,
      total: 302500,
    })

    expect(resultado).toEqual({
      proveedor_nombre: 'Distribuidora Central S.A.',
      proveedor_cuit: '30-71234567-8',
      tipo_comprobante: 'Factura A',
      numero_comprobante: '0001-00012345',
      fecha: '2026-09-10',
      items: [
        { descripcion: 'Balanceado Perro Adulto 15kg', cantidad: 10, costo_unitario: 25000, alicuota_iva: 21 },
      ],
      subtotal: 250000,
      iva_total: 52500,
      total: 302500,
    })
  })

  it('descarta un tipo_comprobante que no es uno de los válidos', () => {
    const resultado = sanearFacturaDetectada({ tipo_comprobante: 'Ticket X' })
    expect(resultado.tipo_comprobante).toBeNull()
  })

  it('descarta una fecha con formato inválido', () => {
    const resultado = sanearFacturaDetectada({ fecha: '10/09/2026' })
    expect(resultado.fecha).toBeNull()
  })

  it('descarta campos numéricos no numéricos y deja el resto', () => {
    const resultado = sanearFacturaDetectada({ subtotal: 'no sé', total: 1000 })
    expect(resultado.subtotal).toBeNull()
    expect(resultado.total).toBe(1000)
  })

  it('descarta ítems sin descripción y sanea los campos numéricos ítem por ítem', () => {
    const resultado = sanearFacturaDetectada({
      items: [
        { descripcion: '', cantidad: 1, costo_unitario: 100, alicuota_iva: 21 },
        { descripcion: 'Collar antipulgas', cantidad: 'dos', costo_unitario: 5000, alicuota_iva: 21 },
      ],
    })
    expect(resultado.items).toEqual([
      { descripcion: 'Collar antipulgas', cantidad: null, costo_unitario: 5000, alicuota_iva: 21 },
    ])
  })

  it('devuelve todos los campos en null/[] para un input vacío o inválido', () => {
    expect(sanearFacturaDetectada({})).toEqual({
      proveedor_nombre: null,
      proveedor_cuit: null,
      tipo_comprobante: null,
      numero_comprobante: null,
      fecha: null,
      items: [],
      subtotal: null,
      iva_total: null,
      total: null,
    })
    expect(sanearFacturaDetectada(null)).toEqual({
      proveedor_nombre: null,
      proveedor_cuit: null,
      tipo_comprobante: null,
      numero_comprobante: null,
      fecha: null,
      items: [],
      subtotal: null,
      iva_total: null,
      total: null,
    })
  })
})
