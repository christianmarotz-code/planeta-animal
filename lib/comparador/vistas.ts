import type { FilaComparador } from '@/lib/data/preciosProveedor'
import type { Producto, Proveedor } from '@/types/database'

export const DIAS_PRECIO_VIEJO = 30
const MS_POR_DIA = 86_400_000

export function esPrecioViejo(actualizadoEn: string, hoy: Date, dias = DIAS_PRECIO_VIEJO): boolean {
  const momento = Date.parse(actualizadoEn)
  if (Number.isNaN(momento)) return false
  return (hoy.getTime() - momento) / MS_POR_DIA > dias
}

export type Comparacion =
  | { tipo: 'mas_barato' }
  | { tipo: 'mas_caro'; porcentaje: number; contra: string }
  | { tipo: 'unico' }

export function compararConOtros(fila: FilaComparador, proveedorId: string): Comparacion {
  const propio = fila.precios.find((p) => p.proveedor.id === proveedorId)
  if (!propio || fila.precios.length < 2) return { tipo: 'unico' }
  const masBarato = fila.precios.reduce((min, p) => (p.precio < min.precio ? p : min), fila.precios[0])
  if (propio.precio <= masBarato.precio) return { tipo: 'mas_barato' }
  const porcentaje =
    masBarato.precio > 0 ? Math.round(((propio.precio - masBarato.precio) / masBarato.precio) * 100) : 0
  return { tipo: 'mas_caro', porcentaje, contra: masBarato.proveedor.nombre }
}

export interface ResumenProveedor {
  proveedor: Proveedor
  cantidadPrecios: number
  ultimaActualizacion: string | null
  cantidadMasBarato: number
}

export function resumirProveedores(filas: FilaComparador[], proveedores: Proveedor[]): ResumenProveedor[] {
  const resumenes = new Map<string, ResumenProveedor>()
  for (const proveedor of proveedores) {
    if (proveedor.activo) {
      resumenes.set(proveedor.id, { proveedor, cantidadPrecios: 0, ultimaActualizacion: null, cantidadMasBarato: 0 })
    }
  }
  for (const fila of filas) {
    for (const precio of fila.precios) {
      const resumen = resumenes.get(precio.proveedor.id)
      if (!resumen) continue
      resumen.cantidadPrecios += 1
      if (!resumen.ultimaActualizacion || precio.actualizadoEn > resumen.ultimaActualizacion) {
        resumen.ultimaActualizacion = precio.actualizadoEn
      }
      if (compararConOtros(fila, precio.proveedor.id).tipo === 'mas_barato') resumen.cantidadMasBarato += 1
    }
  }
  return [...resumenes.values()].sort(
    (a, b) => b.cantidadPrecios - a.cantidadPrecios || a.proveedor.nombre.localeCompare(b.proveedor.nombre)
  )
}

export interface FilaPlanilla {
  precioId: string
  producto: Producto
  precio: number
  nota: string | null
  actualizadoEn: string
  comparacion: Comparacion
}

export function planillaDeProveedor(filas: FilaComparador[], proveedorId: string, busqueda = ''): FilaPlanilla[] {
  const termino = busqueda.trim().toLowerCase()
  const resultado: FilaPlanilla[] = []
  for (const fila of filas) {
    const propio = fila.precios.find((p) => p.proveedor.id === proveedorId)
    if (!propio) continue
    if (termino && !fila.producto.nombre.toLowerCase().includes(termino)) continue
    resultado.push({
      precioId: propio.precioId,
      producto: fila.producto,
      precio: propio.precio,
      nota: propio.nota,
      actualizadoEn: propio.actualizadoEn,
      comparacion: compararConOtros(fila, proveedorId),
    })
  }
  return resultado.sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre))
}

export interface PosicionRanking {
  precioId: string
  proveedor: Proveedor
  precio: number
  nota: string | null
  actualizadoEn: string
}

export function rankingDeProducto(fila: FilaComparador, proveedoresPermitidos: Set<string> | null): PosicionRanking[] {
  return fila.precios
    .filter((p) => !proveedoresPermitidos || proveedoresPermitidos.has(p.proveedor.id))
    .map((p) => ({
      precioId: p.precioId,
      proveedor: p.proveedor,
      precio: p.precio,
      nota: p.nota,
      actualizadoEn: p.actualizadoEn,
    }))
    .sort((a, b) => a.precio - b.precio || a.proveedor.nombre.localeCompare(b.proveedor.nombre))
}

export function buscarProductos(filas: FilaComparador[], busqueda: string, limite = 20): FilaComparador[] {
  const termino = busqueda.trim().toLowerCase()
  if (!termino) return []
  return filas.filter((f) => f.producto.nombre.toLowerCase().includes(termino)).slice(0, limite)
}
