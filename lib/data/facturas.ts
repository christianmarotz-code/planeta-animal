import { createClient } from '@/lib/supabase/client'
import type { FacturaCompra, ItemFactura, TipoComprobante } from '@/types/database'
import type { FacturaDetectada } from '@/lib/facturas/reconocimientoSchema'

export interface NuevaFacturaItemInput {
  producto_id: string
  cantidad: number
  costo_unitario: number
  alicuota_iva: number
}

export interface NuevaFacturaInput {
  proveedor_id: string
  numero_comprobante: string
  tipo_comprobante: TipoComprobante
  fecha: string
  subtotal: number
  iva_total: number
  total: number
  archivo_adjunto?: string | null
  notas?: string | null
  items: NuevaFacturaItemInput[]
}

export async function registrarFacturaCompra(input: NuevaFacturaInput): Promise<{ id: string }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('registrar_factura_compra', { payload: input } as never)
  if (error) throw error
  return { id: data as string }
}

export async function listarFacturas(filtros?: {
  proveedorId?: string
  desde?: string
  hasta?: string
}): Promise<FacturaCompra[]> {
  const supabase = createClient()
  let query = supabase.from('facturas_compra').select('*').order('fecha', { ascending: false })
  if (filtros?.proveedorId) query = query.eq('proveedor_id', filtros.proveedorId)
  if (filtros?.desde) query = query.gte('fecha', filtros.desde)
  if (filtros?.hasta) query = query.lte('fecha', filtros.hasta)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function listarItemsFactura(): Promise<ItemFactura[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('items_factura').select('*')
  if (error) throw error
  return data as ItemFactura[]
}

export async function obtenerFacturaConItems(
  id: string
): Promise<{ factura: FacturaCompra; items: ItemFactura[] }> {
  const supabase = createClient()
  const [{ data: factura, error: facturaError }, { data: items, error: itemsError }] =
    await Promise.all([
      supabase.from('facturas_compra').select('*').eq('id', id).single(),
      supabase.from('items_factura').select('*').eq('factura_id', id),
    ])
  if (facturaError) throw facturaError
  if (itemsError) throw itemsError
  return { factura, items: items ?? [] }
}

export async function anularFactura(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('anular_factura_compra', { p_factura_id: id } as never)
  if (error) throw error
}

export async function subirFotoFactura(file: File): Promise<string> {
  const supabase = createClient()
  const extension = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
  const ruta = `${crypto.randomUUID()}.${extension}`

  const { error } = await supabase.storage.from('facturas-adjuntos').upload(ruta, file)
  if (error) throw error
  return ruta
}

export async function reconocerFactura(
  rutaArchivo: string
): Promise<{ ok: true; factura: FacturaDetectada } | { ok: false; error: string }> {
  const respuesta = await fetch('/api/facturas/reconocer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ruta_archivo: rutaArchivo }),
  })
  if (!respuesta.ok) {
    return { ok: false, error: 'No se pudo leer la factura automáticamente.' }
  }
  const datos = await respuesta.json()
  if (!datos.ok) {
    return { ok: false, error: datos.error ?? 'No se pudo leer la factura automáticamente.' }
  }
  return { ok: true, factura: datos.factura as FacturaDetectada }
}
