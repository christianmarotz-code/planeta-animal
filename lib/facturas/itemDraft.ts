import type { TipoComprobante } from '@/types/database'

// Compartido por compras/nueva y compras/[id] (edición): antes cada página
// tenía su propia copia de esto y ya habían empezado a divergir (wording de
// validación distinto entre las dos).
export const TIPOS_COMPROBANTE: TipoComprobante[] = [
  'Factura A',
  'Factura B',
  'Factura C',
  'Remito',
  'Nota de Credito',
]

export interface ItemDraft {
  producto_id: string
  productoTexto: string
  cantidad: string
  costo_unitario: string
  alicuota_iva: string
}

export function itemDraftVacio(): ItemDraft {
  return { producto_id: '', productoTexto: '', cantidad: '', costo_unitario: '', alicuota_iva: '21' }
}

/**
 * Valida los datos de una factura (proveedor, comprobante, fecha e ítems) antes
 * de guardar. Devuelve el mensaje de error a mostrar, o null si está todo OK.
 */
export function validarBorradorFactura(campos: {
  proveedorId: string
  numeroComprobante: string
  fecha: string
  itemsConDatos: ItemDraft[]
}): string | null {
  if (!campos.proveedorId) return 'Elegí un proveedor.'
  if (!campos.numeroComprobante.trim()) return 'Ingresá el número de comprobante.'
  if (!campos.fecha) return 'Elegí una fecha.'
  if (campos.itemsConDatos.some((it) => !it.producto_id)) {
    return 'Hay ítems sin producto asignado. Vinculalos o creá el producto antes de guardar.'
  }
  if (campos.itemsConDatos.length === 0) {
    return 'Agregá al menos un ítem con producto, cantidad y costo.'
  }
  for (const it of campos.itemsConDatos) {
    if (Number(it.cantidad) <= 0) return 'Las cantidades deben ser mayores a 0.'
    if (Number(it.costo_unitario) <= 0) return 'Los costos deben ser mayores a 0.'
  }
  return null
}
