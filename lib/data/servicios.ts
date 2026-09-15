import { createClient } from '@/lib/supabase/client'
import type { Servicio } from '@/types/database'

export async function listarServicios(): Promise<Servicio[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('servicios')
    .select('*')
    .eq('activo', true)
    .order('nombre')
  if (error) throw error
  return data as Servicio[]
}

export async function crearServicio(
  input: Omit<Servicio, 'id' | 'created_at'>
): Promise<Servicio> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('servicios')
    .insert(input as never)
    .select()
    .single()
  if (error) throw error
  return data as Servicio
}
