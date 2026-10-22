import { describe, expect, it } from 'vitest'
import type { FilaComparador } from '@/lib/data/preciosProveedor'
import type { Producto, Proveedor } from '@/types/database'
import {
  buscarProductos,
  compararConOtros,
  esPrecioViejo,
  planillaDeProveedor,
  rankingDeProducto,
  resumirProveedores,
} from './vistas'

const proveedor = (id: string, nombre: string, activo = true) => ({ id, nombre, activo }) as Proveedor
const producto = (id: string, nombre: string) => ({ id, nombre }) as Producto

function fila(prod: Producto, precios: { p: Proveedor; precio: number; nota?: string | null; fecha?: string }[]): FilaComparador {
  const lista = precios.map((x) => ({
    proveedor: x.p,
    precio: x.precio,
    actualizadoEn: x.fecha ?? '2026-10-20T00:00:00Z',
    precioId: `${prod.id}-${x.p.id}`,
    nota: x.nota ?? null,
  }))
  const mejor = lista.reduce((min, x) => (x.precio < min.precio ? x : min), lista[0])
  return { producto: prod, precios: lista, mejor: { proveedor: mejor.proveedor, precio: mejor.precio } }
}

const bruncas = proveedor('b', 'Bruncas SRL')
const arcuri = proveedor('a', 'Arcuri S.A.')
const beta = proveedor('t', 'BetaPharma S.A.')
const inactivo = proveedor('i', 'Viejo S.A.', false)

describe('esPrecioViejo', () => {
  const hoy = new Date('2026-10-22T12:00:00Z')
  it('es viejo si pasaron más de 30 días', () => {
    expect(esPrecioViejo('2026-09-20T00:00:00Z', hoy)).toBe(true)
  })
  it('no es viejo si pasaron menos de 30 días', () => {
    expect(esPrecioViejo('2026-10-01T00:00:00Z', hoy)).toBe(false)
  })
  it('una fecha inválida no se marca como vieja', () => {
    expect(esPrecioViejo('', hoy)).toBe(false)
  })
})

describe('compararConOtros', () => {
  it('un solo proveedor: único', () => {
    const f = fila(producto('1', 'Abbocath N°14'), [{ p: bruncas, precio: 1200 }])
    expect(compararConOtros(f, 'b')).toEqual({ tipo: 'unico' })
  })

  it('el de menor precio es el más barato', () => {
    const f = fila(producto('1', 'Abbocath N°16'), [{ p: bruncas, precio: 1350 }, { p: arcuri, precio: 1250 }])
    expect(compararConOtros(f, 'a')).toEqual({ tipo: 'mas_barato' })
  })

  it('el más caro dice cuánto más y contra quién', () => {
    const f = fila(producto('1', 'Abbocath N°16'), [{ p: bruncas, precio: 1350 }, { p: arcuri, precio: 1250 }])
    expect(compararConOtros(f, 'b')).toEqual({ tipo: 'mas_caro', porcentaje: 8, contra: 'Arcuri S.A.' })
  })

  it('en empate ambos son los más baratos', () => {
    const f = fila(producto('1', 'X'), [{ p: bruncas, precio: 100 }, { p: arcuri, precio: 100 }])
    expect(compararConOtros(f, 'b')).toEqual({ tipo: 'mas_barato' })
    expect(compararConOtros(f, 'a')).toEqual({ tipo: 'mas_barato' })
  })
})

describe('resumirProveedores', () => {
  const filas = [
    fila(producto('1', 'A'), [{ p: bruncas, precio: 1000, fecha: '2026-10-10T00:00:00Z' }, { p: arcuri, precio: 900, fecha: '2026-10-15T00:00:00Z' }]),
    fila(producto('2', 'B'), [{ p: bruncas, precio: 500, fecha: '2026-10-12T00:00:00Z' }]),
  ]

  it('cuenta precios, última actualización y productos donde es el más barato', () => {
    const r = resumirProveedores(filas, [bruncas, arcuri, beta])
    expect(r.map((x) => x.proveedor.nombre)).toEqual(['Bruncas SRL', 'Arcuri S.A.', 'BetaPharma S.A.'])
    expect(r[0]).toMatchObject({ cantidadPrecios: 2, cantidadMasBarato: 0, ultimaActualizacion: '2026-10-12T00:00:00Z' })
    expect(r[1]).toMatchObject({ cantidadPrecios: 1, cantidadMasBarato: 1 })
    expect(r[2]).toMatchObject({ cantidadPrecios: 0, cantidadMasBarato: 0, ultimaActualizacion: null })
  })

  it('no incluye proveedores inactivos', () => {
    const r = resumirProveedores(filas, [bruncas, inactivo])
    expect(r.map((x) => x.proveedor.id)).toEqual(['b'])
  })
})

describe('planillaDeProveedor', () => {
  const filas = [
    fila(producto('2', 'Zeta'), [{ p: bruncas, precio: 500, nota: '3x2' }]),
    fila(producto('1', 'Abbocath N°14'), [{ p: bruncas, precio: 1200 }, { p: arcuri, precio: 1100 }]),
    fila(producto('3', 'Solo Arcuri'), [{ p: arcuri, precio: 10 }]),
  ]

  it('lista los productos del proveedor ordenados por nombre, con su comparación y nota', () => {
    const r = planillaDeProveedor(filas, 'b')
    expect(r.map((x) => x.producto.nombre)).toEqual(['Abbocath N°14', 'Zeta'])
    expect(r[0].comparacion).toEqual({ tipo: 'mas_caro', porcentaje: 9, contra: 'Arcuri S.A.' })
    expect(r[1]).toMatchObject({ nota: '3x2', precioId: '2-b', comparacion: { tipo: 'unico' } })
  })

  it('filtra por texto sin distinguir mayúsculas', () => {
    expect(planillaDeProveedor(filas, 'b', 'abbo').map((x) => x.producto.id)).toEqual(['1'])
  })
})

describe('rankingDeProducto', () => {
  const f = fila(producto('1', 'Abbocath N°16'), [
    { p: bruncas, precio: 1350 },
    { p: arcuri, precio: 1250, nota: 'Llevando 3, 10%' },
    { p: beta, precio: 1410 },
  ])

  it('ordena del más barato al más caro', () => {
    expect(rankingDeProducto(f, null).map((x) => x.proveedor.nombre)).toEqual(['Arcuri S.A.', 'Bruncas SRL', 'BetaPharma S.A.'])
  })

  it('respeta el filtro de proveedores', () => {
    expect(rankingDeProducto(f, new Set(['b', 't'])).map((x) => x.proveedor.id)).toEqual(['b', 't'])
  })

  it('conserva la nota', () => {
    expect(rankingDeProducto(f, null)[0].nota).toBe('Llevando 3, 10%')
  })
})

describe('buscarProductos', () => {
  const filas = [
    fila(producto('1', 'Abbocath N°14'), [{ p: bruncas, precio: 1 }]),
    fila(producto('2', 'Abbocath N°16'), [{ p: bruncas, precio: 1 }]),
    fila(producto('3', 'Atomizador'), [{ p: bruncas, precio: 1 }]),
  ]

  it('sin texto no devuelve nada', () => {
    expect(buscarProductos(filas, '  ')).toEqual([])
  })

  it('busca por nombre y respeta el límite', () => {
    expect(buscarProductos(filas, 'ABBO').map((f) => f.producto.id)).toEqual(['1', '2'])
    expect(buscarProductos(filas, 'abbo', 1)).toHaveLength(1)
  })
})
