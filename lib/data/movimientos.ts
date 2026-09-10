import { createClient } from '@/lib/supabase/client'
import type { MovimientoStock } from '@/types/database'

export async function listarMovimientosStock(limite = 50): Promise<MovimientoStock[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('movimientos_stock')
    .select('*')
    .order('fecha', { ascending: false })
    .limit(limite)
  if (error) throw error
  return data as MovimientoStock[]
}
