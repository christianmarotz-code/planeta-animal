import { createClient } from '@/lib/supabase/client'
import type { Cliente } from '@/types/database'

export async function listarClientes(): Promise<Cliente[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('clientes').select('*').order('nombre')
  if (error) throw error
  return data as Cliente[]
}

export async function crearCliente(
  input: Omit<Cliente, 'id' | 'created_at'>
): Promise<Cliente> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('clientes')
    .insert(input as never)
    .select()
    .single()
  if (error) throw error
  return data as Cliente
}
