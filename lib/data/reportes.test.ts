import { describe, it, expect } from 'vitest'
import { calcularGastoPorProveedor, calcularValorStock } from './reportes'
import type { FacturaCompra, Proveedor, Producto } from '@/types/database'

function proveedor(id: string, nombre: string): Proveedor {
  return {
    id,
    nombre,
    cuit: null,
    telefono: null,
    email: null,
    direccion: null,
    notas: null,
    aplica_iibb: false,
    tasa_iibb: 4,
    aplica_perc_iva: false,
    tasa_perc_iva: 3,
    descuento_pronto_pago: 0,
    created_at: '',
  }
}

function factura(proveedorId: string, total: number, estado: 'cargada' | 'anulada' = 'cargada'): FacturaCompra {
  return {
    id: crypto.randomUUID(),
    proveedor_id: proveedorId,
    numero_comprobante: '0001',
    tipo_comprobante: 'Factura A',
    fecha: '2026-09-01',
    subtotal: total,
    iva_total: 0,
    total,
    estado,
    archivo_adjunto: null,
    notas: null,
    created_at: '',
    created_by: null,
  }
}

describe('calcularGastoPorProveedor', () => {
  it('sums invoice totals grouped by supplier, excluding annulled invoices', () => {
    const proveedores = [proveedor('p1', 'Proveedor Uno'), proveedor('p2', 'Proveedor Dos')]
    const facturas = [
      factura('p1', 1000),
      factura('p1', 500),
      factura('p2', 2000),
      factura('p1', 9999, 'anulada'),
    ]
    const result = calcularGastoPorProveedor(facturas, proveedores)
    expect(result).toEqual(
      expect.arrayContaining([
        { proveedor: 'Proveedor Uno', total: 1500 },
        { proveedor: 'Proveedor Dos', total: 2000 },
      ])
    )
  })
})

describe('calcularValorStock', () => {
  function producto(stock: number, costo: number): Producto {
    return {
      id: crypto.randomUUID(),
      nombre: 'x',
      categoria: null,
      unidad_compra: 'u',
      unidad_stock: 'u',
      factor_conversion: 1,
      stock_actual: stock,
      stock_minimo: 0,
      costo_unitario_actual: costo,
      alicuota_iva: 21,
      activo: true,
      created_at: '',
    }
  }

  it('sums stock quantity times current unit cost across products', () => {
    const productos = [producto(10, 100), producto(5, 50)]
    expect(calcularValorStock(productos)).toBe(1000 + 250)
  })

  it('returns 0 for no products', () => {
    expect(calcularValorStock([])).toBe(0)
  })
})
