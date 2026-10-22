import { createClient } from '@/lib/supabase/client'
import type { RegistroCambio } from '@/types/database'

export async function listarCambiosProveedor(proveedorId: string, limite = 30): Promise<RegistroCambio[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('registro_cambios')
    .select('*')
    .eq('proveedor_id', proveedorId)
    .order('creado_en', { ascending: false })
    .limit(limite)
  if (error) throw error
  return data as RegistroCambio[]
}
