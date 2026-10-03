import { describe, it, expect } from 'vitest'
import {
  paramDeRama,
  productosDelSector,
  ramaDeParam,
  resumirPorSector,
  slugSector,
} from './sectores'
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

describe('slugSector', () => {
  it('saca acentos, símbolos y espacios', () => {
    expect(slugSector('Medicamento - antibióticos y antimicóticos')).toBe(
      'medicamento-antibioticos-y-antimicoticos'
    )
    expect(slugSector('Paseo (collares, correas, pretales)')).toBe('paseo-collares-correas-pretales')
    expect(slugSector('Administrativo / honorarios')).toBe('administrativo-honorarios')
  })

  it('no deja guiones al borde', () => {
    expect(slugSector('  (Ropa)  ')).toBe('ropa')
  })
})

describe('ramaDeParam', () => {
  it('acepta las ramas y "general" como sin rama', () => {
    expect(ramaDeParam('clinica')).toBe('clinica')
    expect(ramaDeParam('petshop')).toBe('petshop')
    expect(ramaDeParam('general')).toBeNull()
  })

  it('devuelve undefined para cualquier otro valor', () => {
    expect(ramaDeParam('otra')).toBeUndefined()
    expect(ramaDeParam('')).toBeUndefined()
  })

  it('es inverso de paramDeRama', () => {
    for (const r of ['clinica', 'petshop', null] as const) {
      expect(ramaDeParam(paramDeRama(r))).toBe(r)
    }
  })
})

describe('resumirPorSector', () => {
  const lista = [
    producto({ nombre: 'a', stock_actual: 2, stock_minimo: 5, costo_unitario_actual: 100 }),
    producto({ nombre: 'b', stock_actual: 0, stock_minimo: 0, costo_unitario_actual: 50 }),
    producto({ nombre: 'c', stock_actual: -3, costo_unitario_actual: 10 }),
    producto({ nombre: 'd', subcategoria: 'Sin clasificar', stock_actual: 4, costo_unitario_actual: 1 }),
    producto({ nombre: 'e', rama: 'petshop', subcategoria: 'Ropa', stock_actual: 9, costo_unitario_actual: 20 }),
    producto({ nombre: 'baño', categoria: 'Servicio', subcategoria: 'Servicio', stock_actual: 9999 }),
    producto({ nombre: 'cirugía', subcategoria: 'Procedimiento (mover a servicios)', stock_actual: 1 }),
  ]
  const sectores = resumirPorSector(lista)
  const vacunas = sectores.find((s) => s.subcategoria === 'Vacunas')!

  it('cuenta productos, a reponer y sin stock', () => {
    expect(vacunas.productos).toBe(3)
    expect(vacunas.aReponer).toBe(1)
    expect(vacunas.sinStock).toBe(2)
  })

  it('valora solo lo que hay: el stock negativo no resta', () => {
    expect(vacunas.valor).toBe(2 * 100)
  })

  it('deja afuera servicios y filas "(mover a servicios)"', () => {
    expect(sectores.some((s) => s.subcategoria === 'Servicio')).toBe(false)
    expect(sectores.some((s) => s.subcategoria.includes('mover a servicios'))).toBe(false)
  })

  it('separa la misma subcategoría por rama', () => {
    const lista2 = [
      producto({ nombre: 'x', subcategoria: 'Post-quirúrgico y protección' }),
      producto({ nombre: 'y', rama: 'petshop', subcategoria: 'Post-quirúrgico y protección' }),
    ]
    expect(resumirPorSector(lista2)).toHaveLength(2)
  })

  it('ordena por rama, deja "Sin clasificar" al final y luego por nombre', () => {
    expect(sectores.map((s) => `${s.ramaParam}:${s.subcategoria}`)).toEqual([
      'clinica:Vacunas',
      'clinica:Sin clasificar',
      'petshop:Ropa',
    ])
  })

  it('agrupa lo que no tiene subcategoría y lo que no tiene rama', () => {
    const r = resumirPorSector([producto({ nombre: 'z', rama: null, subcategoria: null })])
    expect(r).toHaveLength(1)
    expect(r[0].subcategoria).toBe('Sin subcategoría')
    expect(r[0].ramaParam).toBe('general')
  })
})

describe('productosDelSector', () => {
  const lista = [
    producto({ nombre: 'b' }),
    producto({ nombre: 'a' }),
    producto({ nombre: 'otra rama', rama: 'petshop' }),
    producto({ nombre: 'otra sub', subcategoria: 'Ropa' }),
    producto({ nombre: 'baño', categoria: 'Servicio', subcategoria: 'Vacunas' }),
  ]

  it('trae solo el sector pedido, ordenado por nombre y sin servicios', () => {
    expect(productosDelSector(lista, 'clinica', 'vacunas').map((p) => p.nombre)).toEqual(['a', 'b'])
  })

  it('devuelve vacío si el sector no existe', () => {
    expect(productosDelSector(lista, 'clinica', 'no-existe')).toEqual([])
    expect(productosDelSector(lista, 'inventada', 'vacunas')).toEqual([])
  })
})
