import { createClient } from '@/lib/supabase/client'
import type { EntradaStockSugerida } from '@/types/database'

export async function listarEntradasPendientes(): Promise<EntradaStockSugerida[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('entradas_stock_sugeridas')
    .select('*')
    .eq('estado', 'pendiente')
    .order('created_at')
  if (error) throw error
  return (data ?? []) as EntradaStockSugerida[]
}

/** Recién acá se suma el stock, con la cantidad que realmente llegó. */
export async function confirmarEntradaStock(
  entradaId: string,
  cantidadRecibida: number,
  nota: string | null
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('confirmar_entrada_stock', {
    p_entrada_id: entradaId,
    p_cantidad_recibida: cantidadRecibida,
    p_nota: nota,
  } as never)
  if (error) throw error
}
