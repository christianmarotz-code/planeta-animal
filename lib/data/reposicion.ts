import { listarProductos } from './productos'
import { listarComparador, type FilaComparador } from './preciosProveedor'
import type { Producto, Proveedor } from '@/types/database'

export interface ItemReposicion {
  producto: Producto
  cantidadSugerida: number
  precio: number
}

export interface PaqueteReposicion {
  proveedor: Proveedor
  items: ItemReposicion[]
}

export interface ReposicionSugerida {
  paquetes: PaqueteReposicion[]
  sinPrecio: Producto[]
}

export const REPOSICION_DRAFT_KEY = 'reposicion-draft'

export interface BorradorReposicionItem {
  productoId: string
  cantidad: number
  costoUnitario: number
  alicuotaIva: number
}

export interface BorradorReposicion {
  proveedorId: string
  items: BorradorReposicionItem[]
}

export function agruparReposicionSugerida(
  productos: Producto[],
  filas: FilaComparador[]
): ReposicionSugerida {
  const filaPorProductoId = new Map(filas.map((f) => [f.producto.id, f]))
  const paquetesPorProveedorId = new Map<string, PaqueteReposicion>()
  const sinPrecio: Producto[] = []

  for (const producto of productos) {
    const fila = filaPorProductoId.get(producto.id)
    if (!fila || !fila.mejor) {
      sinPrecio.push(producto)
      continue
    }
    const cantidadSugerida = Math.max(1, producto.stock_minimo - producto.stock_actual)
    const item: ItemReposicion = { producto, cantidadSugerida, precio: fila.mejor.precio }
    const paqueteExistente = paquetesPorProveedorId.get(fila.mejor.proveedor.id)
    if (paqueteExistente) {
      paqueteExistente.items.push(item)
    } else {
      paquetesPorProveedorId.set(fila.mejor.proveedor.id, {
        proveedor: fila.mejor.proveedor,
        items: [item],
      })
    }
  }

  return { paquetes: Array.from(paquetesPorProveedorId.values()), sinPrecio }
}

export async function listarReposicionSugerida(): Promise<ReposicionSugerida> {
  const [productos, filas] = await Promise.all([
    listarProductos({ soloStockBajo: true }),
    listarComparador(),
  ])
  return agruparReposicionSugerida(productos, filas)
}
