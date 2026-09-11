import { describe, it, expect } from 'vitest'
import { emparejarProveedor, emparejarProducto } from './facturaMatching'
import type { Proveedor, Producto } from '@/types/database'

function proveedor(id: string, nombre: string, cuit: string | null = null): Proveedor {
  return {
    id,
    nombre,
    cuit,
    telefono: null,
    email: null,
    direccion: null,
    notas: null,
    aplica_iibb: false,
    tasa_iibb: 0,
    aplica_perc_iva: false,
    tasa_perc_iva: 0,
    descuento_pronto_pago: 0,
    created_at: '',
  }
}

function producto(id: string, nombre: string): Producto {
  return {
    id,
    nombre,
    categoria: null,
    rama: null,
    unidad_compra: 'unidad',
    unidad_stock: 'unidad',
    factor_conversion: 1,
    stock_actual: 0,
    stock_minimo: 0,
    costo_unitario_actual: 0,
    precio_venta: 0,
    alicuota_iva: 21,
    activo: true,
    codigo: null,
    codigo_barras: null,
    created_at: '',
  }
}

describe('emparejarProveedor', () => {
  const proveedores = [
    proveedor('p1', 'Distribuidora Central S.A.', '30712345678'),
    proveedor('p2', 'Royal Canin Argentina'),
  ]

  it('matchea por CUIT exacto, ignorando guiones', () => {
    const resultado = emparejarProveedor({ nombre: null, cuit: '30-71234567-8' }, proveedores)
    expect(resultado?.id).toBe('p1')
  })

  it('matchea por nombre exacto normalizado', () => {
    const resultado = emparejarProveedor({ nombre: 'royal canin argentina', cuit: null }, proveedores)
    expect(resultado?.id).toBe('p2')
  })

  it('matchea por coincidencia parcial de nombre', () => {
    const resultado = emparejarProveedor({ nombre: 'Distribuidora Central', cuit: null }, proveedores)
    expect(resultado?.id).toBe('p1')
  })

  it('devuelve null si no hay ningún match', () => {
    const resultado = emparejarProveedor({ nombre: 'Proveedor Inexistente', cuit: '99999999999' }, proveedores)
    expect(resultado).toBeNull()
  })

  it('devuelve null si no viene nombre ni cuit', () => {
    const resultado = emparejarProveedor({ nombre: null, cuit: null }, proveedores)
    expect(resultado).toBeNull()
  })
})

describe('emparejarProducto', () => {
  const productos = [producto('prod1', 'Pipeta Antipulgas Grande'), producto('prod2', 'Balanceado Gato Adulto 3kg')]

  it('matchea por nombre exacto normalizado', () => {
    expect(emparejarProducto('pipeta antipulgas grande', productos)?.id).toBe('prod1')
  })

  it('matchea por coincidencia parcial', () => {
    expect(emparejarProducto('Balanceado Gato Adulto', productos)?.id).toBe('prod2')
  })

  it('devuelve null si no matchea nada', () => {
    expect(emparejarProducto('Shampoo Antipulgas', productos)).toBeNull()
  })

  it('devuelve null para input null o vacío', () => {
    expect(emparejarProducto(null, productos)).toBeNull()
    expect(emparejarProducto('', productos)).toBeNull()
  })
})
