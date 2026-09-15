import { createClient } from '@/lib/supabase/client'
import type { Venta, ItemVenta, MedioPago, TipoItemVenta } from '@/types/database'

export interface NuevaVentaItemInput {
  tipo: TipoItemVenta
  producto_id?: string | null
  servicio_id?: string | null
  cantidad: number
  precio_unitario: number
}

export interface NuevaVentaInput {
  cliente_id?: string | null
  fecha: string
  medio_pago: MedioPago
  subtotal: number
  iva_total: number
  total: number
  notas?: string | null
  items: NuevaVentaItemInput[]
}

export async function registrarVenta(input: NuevaVentaInput): Promise<{ id: string }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('registrar_venta', { payload: input } as never)
  if (error) throw error
  return { id: data as string }
}

export async function listarVentas(filtros?: {
  clienteId?: string
  medioPago?: MedioPago
  desde?: string
  hasta?: string
}): Promise<Venta[]> {
  const supabase = createClient()
  let query = supabase.from('ventas').select('*').order('fecha', { ascending: false })
  if (filtros?.clienteId) query = query.eq('cliente_id', filtros.clienteId)
  if (filtros?.medioPago) query = query.eq('medio_pago', filtros.medioPago)
  if (filtros?.desde) query = query.gte('fecha', filtros.desde)
  if (filtros?.hasta) query = query.lte('fecha', filtros.hasta)
  const { data, error } = await query
  if (error) throw error
  return data as Venta[]
}

export async function obtenerVentaConItems(
  id: string
): Promise<{ venta: Venta; items: ItemVenta[] }> {
  const supabase = createClient()
  const [{ data: venta, error: ventaError }, { data: items, error: itemsError }] =
    await Promise.all([
      supabase.from('ventas').select('*').eq('id', id).single(),
      supabase.from('items_venta').select('*').eq('venta_id', id),
    ])
  if (ventaError) throw ventaError
  if (itemsError) throw itemsError
  return { venta: venta as Venta, items: (items ?? []) as ItemVenta[] }
}

export async function listarItemsVenta(): Promise<ItemVenta[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('items_venta').select('*')
  if (error) throw error
  return data as ItemVenta[]
}

export async function anularVenta(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('anular_venta', { p_venta_id: id } as never)
  if (error) throw error
}
