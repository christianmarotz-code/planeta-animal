import { createClient } from '@/lib/supabase/client'
import type { Producto } from '@/types/database'

const TAMANO_PAGINA = 1000

export async function listarProductos(filtros?: {
  categoria?: string
  soloStockBajo?: boolean
}): Promise<Producto[]> {
  const supabase = createClient()
  const productos: Producto[] = []
  let desde = 0
  // PostgREST devuelve como máximo TAMANO_PAGINA filas por consulta; se pagina
  // hasta agotar los resultados para no truncar el catálogo (>1000 productos).
  while (true) {
    let query = supabase
      .from('productos')
      .select('*')
      .eq('activo', true)
      .order('nombre')
      .range(desde, desde + TAMANO_PAGINA - 1)
    if (filtros?.categoria) query = query.eq('categoria', filtros.categoria)
    const { data, error } = await query
    if (error) throw error
    // Supabase's generated types resolve `data` to `never[]` for this query shape;
    // cast locally (scoped to this function) rather than touching types/database.ts.
    const pagina = data as Producto[]
    productos.push(...pagina)
    if (pagina.length < TAMANO_PAGINA) break
    desde += TAMANO_PAGINA
  }
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
  input: Omit<
    Producto,
    'id' | 'created_at' | 'stock_actual' | 'costo_unitario_actual' | 'precio_venta' | 'codigo' | 'codigo_barras'
  >
): Promise<Producto> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('productos')
    .insert({
      ...input,
      stock_actual: 0,
      costo_unitario_actual: 0,
      precio_venta: 0,
      codigo: null,
      codigo_barras: null,
    } as never)
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
