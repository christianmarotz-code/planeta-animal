import type { Producto, Rama } from '@/types/database'
import { aReponer, esStockeable } from './stock'

export const SIN_SUBCATEGORIA = 'Sin subcategoría'
const SIN_CLASIFICAR = 'Sin clasificar'
const ORDEN_RAMA = ['clinica', 'petshop']

/** Valor del segmento de URL para los productos que no tienen rama. */
export const RAMA_GENERAL = 'general'

/** "Medicamento - antibióticos y antimicóticos" → "medicamento-antibioticos-y-antimicoticos". */
export function slugSector(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function paramDeRama(rama: Rama | null): string {
  return rama ?? RAMA_GENERAL
}

export function etiquetaRama(rama: Rama | null): string {
  if (rama === 'clinica') return 'Clínica'
  if (rama === 'petshop') return 'Petshop'
  return 'Sin rama'
}

/**
 * Traduce el segmento de URL a una rama. `undefined` si no es un valor válido:
 * cualquiera puede escribir una URL a mano, así que no se asume nada.
 */
export function ramaDeParam(param: string): Rama | null | undefined {
  if (param === 'clinica' || param === 'petshop') return param
  if (param === RAMA_GENERAL) return null
  return undefined
}

export interface ResumenSector {
  rama: Rama | null
  ramaParam: string
  subcategoria: string
  slug: string
  productos: number
  aReponer: number
  sinStock: number
  /** Costo × stock de lo que hay (el stock negativo no resta). */
  valor: number
}

function ordenRama(rama: Rama | null) {
  const i = rama ? ORDEN_RAMA.indexOf(rama) : -1
  return i === -1 ? ORDEN_RAMA.length : i
}

function esSinClasificar(subcategoria: string) {
  return subcategoria === SIN_CLASIFICAR || subcategoria === SIN_SUBCATEGORIA
}

/**
 * Un sector es una subcategoría dentro de una rama. Solo cuenta mercadería:
 * los servicios y los ítems marcados "(mover a servicios)" tienen stock de
 * relleno y no tienen lugar en una vista de stock.
 */
export function resumirPorSector(productos: Producto[]): ResumenSector[] {
  const sectores = new Map<string, ResumenSector>()
  for (const p of productos) {
    if (!esStockeable(p)) continue
    const subcategoria = p.subcategoria ?? SIN_SUBCATEGORIA
    const slug = slugSector(subcategoria)
    const ramaParam = paramDeRama(p.rama)
    const clave = `${ramaParam}/${slug}`
    let s = sectores.get(clave)
    if (!s) {
      s = { rama: p.rama, ramaParam, subcategoria, slug, productos: 0, aReponer: 0, sinStock: 0, valor: 0 }
      sectores.set(clave, s)
    }
    s.productos++
    if (aReponer(p)) s.aReponer++
    if (p.stock_actual <= 0) s.sinStock++
    s.valor += Math.max(p.stock_actual, 0) * p.costo_unitario_actual
  }
  return [...sectores.values()].sort(
    (a, b) =>
      ordenRama(a.rama) - ordenRama(b.rama) ||
      Number(esSinClasificar(a.subcategoria)) - Number(esSinClasificar(b.subcategoria)) ||
      a.subcategoria.localeCompare(b.subcategoria)
  )
}

/** Los productos de mercadería de un sector, ordenados por nombre. */
export function productosDelSector(productos: Producto[], ramaParam: string, slug: string): Producto[] {
  return productos
    .filter(
      (p) =>
        esStockeable(p) &&
        paramDeRama(p.rama) === ramaParam &&
        slugSector(p.subcategoria ?? SIN_SUBCATEGORIA) === slug
    )
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
}
