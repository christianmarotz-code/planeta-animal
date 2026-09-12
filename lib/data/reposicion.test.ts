import { describe, it, expect } from 'vitest'
import { agruparReposicionSugerida } from './reposicion'
import type { FilaComparador } from './preciosProveedor'
import type { Producto, Proveedor } from '@/types/database'

function producto(id: string, stockActual: number, stockMinimo: number, nombre = 'x'): Producto {
  return {
    id,
    nombre,
    categoria: null,
    rama: null,
    unidad_compra: 'unidad',
    unidad_stock: 'unidad',
    factor_conversion: 1,
    stock_actual: stockActual,
    stock_minimo: stockMinimo,
    costo_unitario_actual: 0,
    precio_venta: 0,
    alicuota_iva: 21,
    activo: true,
    codigo: null,
    codigo_barras: null,
    created_at: '',
  }
}

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
    tasa_iibb: 0,
    aplica_perc_iva: false,
    tasa_perc_iva: 0,
    descuento_pronto_pago: 0,
    created_at: '',
  }
}

function filaComparador(
  productoRow: Producto,
  mejor: { proveedor: Proveedor; precio: number } | null
): FilaComparador {
  return {
    producto: productoRow,
    precios: mejor ? [{ proveedor: mejor.proveedor, precio: mejor.precio, actualizadoEn: '' }] : [],
    mejor,
  }
}

describe('agruparReposicionSugerida', () => {
  it('groups a low-stock product under its cheapest provider with the suggested quantity', () => {
    const p1 = producto('p1', 2, 10)
    const provA = proveedor('provA', 'Proveedor A')
    const filas = [filaComparador(p1, { proveedor: provA, precio: 100 })]

    const resultado = agruparReposicionSugerida([p1], filas)

    expect(resultado.paquetes).toEqual([
      { proveedor: provA, items: [{ producto: p1, cantidadSugerida: 8, precio: 100 }] },
    ])
    expect(resultado.sinPrecio).toEqual([])
  })

  it('floors the suggested quantity at 1 even when stock is already at or above minimum', () => {
    const p1 = producto('p1', 10, 5)
    const provA = proveedor('provA', 'Proveedor A')
    const filas = [filaComparador(p1, { proveedor: provA, precio: 50 })]

    const resultado = agruparReposicionSugerida([p1], filas)

    expect(resultado.paquetes[0].items[0].cantidadSugerida).toBe(1)
  })

  it('puts a low-stock product with no comparador price into sinPrecio', () => {
    const p1 = producto('p1', 0, 5)

    const resultado = agruparReposicionSugerida([p1], [])

    expect(resultado.paquetes).toEqual([])
    expect(resultado.sinPrecio).toEqual([p1])
  })

  it('groups two products with the same cheapest provider into one package', () => {
    const p1 = producto('p1', 0, 5)
    const p2 = producto('p2', 0, 3)
    const provA = proveedor('provA', 'Proveedor A')
    const filas = [
      filaComparador(p1, { proveedor: provA, precio: 10 }),
      filaComparador(p2, { proveedor: provA, precio: 20 }),
    ]

    const resultado = agruparReposicionSugerida([p1, p2], filas)

    expect(resultado.paquetes).toHaveLength(1)
    expect(resultado.paquetes[0].items).toHaveLength(2)
  })
})
