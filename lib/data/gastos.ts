import { createClient } from '@/lib/supabase/client'
import type { Gasto } from '@/types/database'

export interface NuevoGastoInput {
  fecha: string
  categoria: Gasto['categoria']
  concepto: string
  proveedor?: string | null
  monto: number
  rama?: Gasto['rama']
  notas?: string | null
}

export async function listarGastos(filtros?: {
  categoria?: Gasto['categoria']
  desde?: string
  hasta?: string
}): Promise<Gasto[]> {
  const supabase = createClient()
  let query = supabase.from('gastos').select('*').order('fecha', { ascending: false })
  if (filtros?.categoria) query = query.eq('categoria', filtros.categoria)
  if (filtros?.desde) query = query.gte('fecha', filtros.desde)
  if (filtros?.hasta) query = query.lte('fecha', filtros.hasta)
  const { data, error } = await query
  if (error) throw error
  return data as Gasto[]
}

export async function registrarGasto(input: NuevoGastoInput): Promise<Gasto> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('gastos')
    .insert({ ...input, created_by: user?.id ?? null } as never)
    .select()
    .single()
  if (error) throw error
  return data as Gasto
}
