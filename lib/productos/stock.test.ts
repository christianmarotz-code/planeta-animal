import { describe, it, expect } from 'vitest'
import { aReponer, comparador, cumpleEstado, esStockeable, faltante } from './stock'
import type { Producto } from '@/types/database'

function producto(over: Partial<Producto> & { nombre: string }): Producto {
  return {
    id: over.nombre,
    categoria: 'Medicamento',
    rama: 'clinica',
    subcategoria: 'Vacunas',
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
    ...over,
  }
}

describe('esStockeable', () => {
  it('excluye servicios y filas marcadas para mover a servicios', () => {
    expect(esStockeable(producto({ nombre: 'a' }))).toBe(true)
    expect(esStockeable(producto({ nombre: 'b', categoria: 'Servicio' }))).toBe(false)
    expect(esStockeable(producto({ nombre: 'c', subcategoria: 'Servicio' }))).toBe(false)
    expect(
      esStockeable(producto({ nombre: 'd', subcategoria: 'Procedimiento (mover a servicios)' }))
    ).toBe(false)
  })

  it('trata la subcategoría vacía como stockeable', () => {
    expect(esStockeable(producto({ nombre: 'e', subcategoria: null }))).toBe(true)
    expect(esStockeable(producto({ nombre: 'f', subcategoria: undefined }))).toBe(true)
  })
})

describe('aReponer', () => {
  it('exige un mínimo cargado y stock menor o igual a él', () => {
    expect(aReponer(producto({ nombre: 'a', stock_actual: 2, stock_minimo: 5 }))).toBe(true)
    expect(aReponer(producto({ nombre: 'b', stock_actual: 5, stock_minimo: 5 }))).toBe(true)
    expect(aReponer(producto({ nombre: 'c', stock_actual: 6, stock_minimo: 5 }))).toBe(false)
  })

  it('no cuenta productos sin mínimo cargado aunque tengan stock 0', () => {
    expect(aReponer(producto({ nombre: 'd', stock_actual: 0, stock_minimo: 0 }))).toBe(false)
  })

  it('no cuenta servicios con stock de relleno bajo su mínimo', () => {
    expect(
      aReponer(producto({ nombre: 'e', categoria: 'Servicio', stock_actual: 0, stock_minimo: 3 }))
    ).toBe(false)
  })
})

describe('cumpleEstado', () => {
  const sinStock = producto({ nombre: 'sin', stock_actual: 0 })
  const negativo = producto({ nombre: 'neg', stock_actual: -3 })
  const conStock = producto({ nombre: 'con', stock_actual: 4 })
  const servicio = producto({ nombre: 'bano', categoria: 'Servicio', stock_actual: 9999 })

  it('todos deja pasar cualquier cosa, incluso servicios', () => {
    expect(cumpleEstado(servicio, 'todos')).toBe(true)
  })

  it('sin_stock incluye el negativo y excluye al que tiene stock', () => {
    expect(cumpleEstado(sinStock, 'sin_stock')).toBe(true)
    expect(cumpleEstado(negativo, 'sin_stock')).toBe(true)
    expect(cumpleEstado(conStock, 'sin_stock')).toBe(false)
  })

  it('negativo solo toma stock menor que cero', () => {
    expect(cumpleEstado(negativo, 'negativo')).toBe(true)
    expect(cumpleEstado(sinStock, 'negativo')).toBe(false)
  })

  it('con_stock excluye servicios aunque tengan stock de relleno', () => {
    expect(cumpleEstado(conStock, 'con_stock')).toBe(true)
    expect(cumpleEstado(servicio, 'con_stock')).toBe(false)
  })
})

describe('comparador', () => {
  const a = producto({ nombre: 'A', stock_actual: 10, stock_minimo: 20, costo_unitario_actual: 5 })
  const b = producto({ nombre: 'B', stock_actual: 50, stock_minimo: 10, costo_unitario_actual: 9 })
  const c = producto({ nombre: 'C', stock_actual: 1, stock_minimo: 30, costo_unitario_actual: 2 })
  const servicio = producto({ nombre: 'Z baño', categoria: 'Servicio', stock_actual: 9999 })

  const nombres = (orden: Parameters<typeof comparador>[0]) =>
    [a, b, c, servicio].sort(comparador(orden)).map((p) => p.nombre)

  it('mas_stock manda los servicios al final aunque tengan 9999', () => {
    expect(nombres('mas_stock')).toEqual(['B', 'A', 'C', 'Z baño'])
  })

  it('menos_stock ordena de menor a mayor y deja servicios al final', () => {
    expect(nombres('menos_stock')).toEqual(['C', 'A', 'B', 'Z baño'])
  })

  it('urgente pone primero al que más le falta para su mínimo', () => {
    expect(faltante(c)).toBe(29)
    expect(nombres('urgente')).toEqual(['C', 'A', 'B', 'Z baño'])
  })

  it('ordena por costo y por nombre', () => {
    expect(nombres('mayor_costo')[0]).toBe('B')
    expect(nombres('menor_costo')[0]).toBe('Z baño')
    expect(nombres('nombre')).toEqual(['A', 'B', 'C', 'Z baño'])
  })

  it('desempata por nombre', () => {
    const x = producto({ nombre: 'X', stock_actual: 7 })
    const y = producto({ nombre: 'Y', stock_actual: 7 })
    expect([y, x].sort(comparador('mas_stock')).map((p) => p.nombre)).toEqual(['X', 'Y'])
  })
})
