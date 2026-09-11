import type { TipoComprobante } from '@/types/database'

export interface ItemFacturaDetectado {
  descripcion: string
  cantidad: number | null
  costo_unitario: number | null
  alicuota_iva: number | null
}

export interface FacturaDetectada {
  proveedor_nombre: string | null
  proveedor_cuit: string | null
  tipo_comprobante: TipoComprobante | null
  numero_comprobante: string | null
  fecha: string | null
  items: ItemFacturaDetectado[]
  subtotal: number | null
  iva_total: number | null
  total: number | null
}

const TIPOS_COMPROBANTE_VALIDOS: TipoComprobante[] = [
  'Factura A',
  'Factura B',
  'Factura C',
  'Remito',
  'Nota de Credito',
]

const REGEX_FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/

function comoStringONull(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const recortado = valor.trim()
  return recortado.length > 0 ? recortado : null
}

function comoNumeroONull(valor: unknown): number | null {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return null
  return valor
}

function comoTipoComprobanteONull(valor: unknown): TipoComprobante | null {
  return TIPOS_COMPROBANTE_VALIDOS.includes(valor as TipoComprobante) ? (valor as TipoComprobante) : null
}

function comoFechaISOONull(valor: unknown): string | null {
  return typeof valor === 'string' && REGEX_FECHA_ISO.test(valor) ? valor : null
}

function sanearItems(valor: unknown): ItemFacturaDetectado[] {
  if (!Array.isArray(valor)) return []
  const items: ItemFacturaDetectado[] = []
  for (const itemCrudo of valor) {
    if (typeof itemCrudo !== 'object' || itemCrudo === null) continue
    const item = itemCrudo as Record<string, unknown>
    const descripcion = comoStringONull(item.descripcion)
    if (!descripcion) continue
    items.push({
      descripcion,
      cantidad: comoNumeroONull(item.cantidad),
      costo_unitario: comoNumeroONull(item.costo_unitario),
      alicuota_iva: comoNumeroONull(item.alicuota_iva),
    })
  }
  return items
}

export function sanearFacturaDetectada(raw: unknown): FacturaDetectada {
  const datos = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    proveedor_nombre: comoStringONull(datos.proveedor_nombre),
    proveedor_cuit: comoStringONull(datos.proveedor_cuit),
    tipo_comprobante: comoTipoComprobanteONull(datos.tipo_comprobante),
    numero_comprobante: comoStringONull(datos.numero_comprobante),
    fecha: comoFechaISOONull(datos.fecha),
    items: sanearItems(datos.items),
    subtotal: comoNumeroONull(datos.subtotal),
    iva_total: comoNumeroONull(datos.iva_total),
    total: comoNumeroONull(datos.total),
  }
}
