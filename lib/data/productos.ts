import { createClient } from '@/lib/supabase/client'
import type { Producto } from '@/types/database'

export async function listarProductos(filtros?: {
  categoria?: string
  soloStockBajo?: boolean
}): Promise<Producto[]> {
  const supabase = createClient()
  let query = supabase.from('productos').select('*').eq('activo', true).order('nombre')
  if (filtros?.categoria) query = query.eq('categoria', filtros.categoria)
  const { data, error } = await query
  if (error) throw error
  // Supabase's generated types resolve `data` to `never[]` for this query shape;
  // cast locally (scoped to this function) rather than touching types/database.ts.
  const productos = data as Producto[]
  if (filtros?.soloStockBajo) {
    return productos.filter((p) => p.stock_actual <= p.stock_minimo)
  }
  return productos
}

export async function obtenerProducto(id: string): Promise<Producto> {
  const supabase = createClient()
  const { data, error } = await supabase.from('productos').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function crearProducto(
  input: Omit<Producto, 'id' | 'created_at' | 'stock_actual' | 'costo_unitario_actual'>
): Promise<Producto> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('productos')
    .insert({ ...input, stock_actual: 0, costo_unitario_actual: 0 } as never)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function actualizarProducto(id: string, input: Partial<Producto>): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('productos').update(input as never).eq('id', id)
  if (error) throw error
}
