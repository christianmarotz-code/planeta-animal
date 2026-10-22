import { describe, expect, it } from 'vitest'
import type { PrecioProveedor, Producto, Proveedor } from '@/types/database'
import { armarFilasComparador } from './preciosProveedor'

const proveedor = (id: string, nombre: string) => ({ id, nombre, activo: true }) as Proveedor
const producto = (id: string, nombre: string) => ({ id, nombre }) as Producto
const precio = (id: string, proveedorId: string, productoId: string, valor: number) =>
  ({ id, proveedor_id: proveedorId, producto_id: productoId, precio: valor, nota: null, actualizado_en: '2026-10-20T00:00:00Z' }) as PrecioProveedor

const bruncas = proveedor('b', 'Bruncas SRL')
const arcuri = proveedor('a', 'Arcuri S.A.')

describe('armarFilasComparador', () => {
  it('un precio en cero no cuenta: ni aparece ni gana como el más barato', () => {
    const filas = armarFilasComparador(
      [producto('1', 'Abbocath N°14')],
      [bruncas, arcuri],
      [precio('p1', 'b', '1', 0), precio('p2', 'a', '1', 1250)]
    )
    expect(filas).toHaveLength(1)
    expect(filas[0].precios.map((p) => p.proveedor.id)).toEqual(['a'])
    expect(filas[0].mejor).toEqual({ proveedor: arcuri, precio: 1250 })
  })

  it('un producto con todos sus precios en cero no aparece', () => {
    const filas = armarFilasComparador([producto('1', 'X')], [bruncas], [precio('p1', 'b', '1', 0)])
    expect(filas).toEqual([])
  })

  it('con precios válidos arma la fila con sus datos, ordenada por nombre', () => {
    const filas = armarFilasComparador(
      [producto('2', 'Zeta'), producto('1', 'Abbocath')],
      [bruncas, arcuri],
      [precio('p1', 'b', '1', 1350), precio('p2', 'a', '1', 1250), precio('p3', 'b', '2', 10)]
    )
    expect(filas.map((f) => f.producto.nombre)).toEqual(['Abbocath', 'Zeta'])
    expect(filas[0].mejor).toEqual({ proveedor: arcuri, precio: 1250 })
    expect(filas[0].precios).toHaveLength(2)
  })

  it('ignora precios de proveedores que no existen', () => {
    const filas = armarFilasComparador([producto('1', 'X')], [bruncas], [precio('p1', 'zzz', '1', 100)])
    expect(filas).toEqual([])
  })
})
