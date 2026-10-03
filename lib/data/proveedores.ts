import { createClient } from '@/lib/supabase/client'
import type { Proveedor } from '@/types/database'

// Columnas que la base completa sola (defaults o recálculo al registrar facturas).
export type CamposProveedorAutomaticos =
  | 'razon_social'
  | 'alias'
  | 'tipos_comprobante'
  | 'condicion_pago_habitual'
  | 'formato_habitual'
  | 'primera_boleta'
  | 'ultima_boleta'
  | 'cantidad_boletas'
  | 'total_acumulado'
  | 'activo'

export async function listarProveedores(): Promise<Proveedor[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('proveedores').select('*').order('nombre')
  if (error) throw error
  return data
}

export async function obtenerProveedor(id: string): Promise<Proveedor> {
  const supabase = createClient()
  const { data, error } = await supabase.from('proveedores').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function crearProveedor(
  input: Omit<Proveedor, 'id' | 'created_at' | CamposProveedorAutomaticos>
): Promise<Proveedor> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('proveedores')
    .insert(input as never)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function actualizarProveedor(id: string, input: Partial<Proveedor>): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('proveedores').update(input as never).eq('id', id)
  if (error) throw error
}
