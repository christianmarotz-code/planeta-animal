import { createClient } from '@/lib/supabase/client'

export async function ajustarStockManual(
  productoId: string,
  cantidad: number,
  motivo: string
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('ajustar_stock_manual', {
    p_producto_id: productoId,
    p_cantidad: cantidad,
    p_motivo: motivo,
  } as never)
  if (error) throw error
}
