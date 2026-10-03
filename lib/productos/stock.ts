import type { Producto } from '@/types/database'

export type EstadoStock = 'todos' | 'reponer' | 'sin_stock' | 'negativo' | 'con_stock'

export type OrdenProductos =
  | 'nombre'
  | 'mas_stock'
  | 'menos_stock'
  | 'urgente'
  | 'mayor_costo'
  | 'menor_costo'

// Los servicios (baño, corte) y los ítems que son procedimientos o trámites
// están cargados como producto con stock de relleno (9.999 unidades, por
// ejemplo). No son mercadería: si entraran en los rankings o en "a reponer"
// taparían a los productos reales.
export function esStockeable(p: Pick<Producto, 'categoria' | 'subcategoria'>): boolean {
  if (p.categoria === 'Servicio' || p.subcategoria === 'Servicio') return false
  return !(p.subcategoria ?? '').includes('(mover a servicios)')
}

// "A reponer": llegó al mínimo que se cargó para el producto. Sin mínimo
// cargado no hay umbral, así que no cuenta (si no, todo producto con stock 0
// y mínimo 0 aparecería como urgente).
export function aReponer(p: Producto): boolean {
  return esStockeable(p) && p.stock_minimo > 0 && p.stock_actual <= p.stock_minimo
}

// Cuánto falta para llegar al mínimo. Positivo = por debajo del mínimo.
export function faltante(p: Producto): number {
  return p.stock_minimo - p.stock_actual
}

export function cumpleEstado(p: Producto, estado: EstadoStock): boolean {
  if (estado === 'todos') return true
  if (!esStockeable(p)) return false
  switch (estado) {
    case 'reponer':
      return aReponer(p)
    case 'sin_stock':
      return p.stock_actual <= 0
    case 'negativo':
      return p.stock_actual < 0
    case 'con_stock':
      return p.stock_actual > 0
  }
}

const porNombre = (a: Producto, b: Producto) => a.nombre.localeCompare(b.nombre)
const noStockeableAlFinal = (a: Producto, b: Producto) =>
  Number(!esStockeable(a)) - Number(!esStockeable(b))

export function comparador(orden: OrdenProductos): (a: Producto, b: Producto) => number {
  switch (orden) {
    case 'mas_stock':
      return (a, b) => noStockeableAlFinal(a, b) || b.stock_actual - a.stock_actual || porNombre(a, b)
    case 'menos_stock':
      return (a, b) => noStockeableAlFinal(a, b) || a.stock_actual - b.stock_actual || porNombre(a, b)
    case 'urgente':
      return (a, b) => noStockeableAlFinal(a, b) || faltante(b) - faltante(a) || porNombre(a, b)
    case 'mayor_costo':
      return (a, b) => b.costo_unitario_actual - a.costo_unitario_actual || porNombre(a, b)
    case 'menor_costo':
      return (a, b) => a.costo_unitario_actual - b.costo_unitario_actual || porNombre(a, b)
    case 'nombre':
      return porNombre
  }
}
