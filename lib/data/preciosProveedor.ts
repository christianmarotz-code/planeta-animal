import { createClient } from '@/lib/supabase/client'
import type { PrecioProveedor, Producto, Proveedor } from '@/types/database'

const TAMANO_PAGINA = 1000

function normalizarNombre(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

/** Parser de CSV tolerante a "," o ";" como separador y a campos entre comillas. */
export function parsearCSV(texto: string): string[][] {
  const lineas = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.length > 0)
  if (lineas.length === 0) return []
  const separador = (lineas[0].match(/;/g)?.length ?? 0) >= (lineas[0].match(/,/g)?.length ?? 0) ? ';' : ','

  function parsearLinea(linea: string): string[] {
    const campos: string[] = []
    let actual = ''
    let entreComillas = false
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i]
      if (entreComillas) {
        if (c === '"' && linea[i + 1] === '"') {
          actual += '"'
          i++
        } else if (c === '"') {
          entreComillas = false
        } else {
          actual += c
        }
      } else if (c === '"') {
        entreComillas = true
      } else if (c === separador) {
        campos.push(actual)
        actual = ''
      } else {
        actual += c
      }
    }
    campos.push(actual)
    return campos.map((c) => c.trim())
  }

  return lineas.map(parsearLinea)
}

export interface ColumnasDetectadas {
  codigo: number | null
  nombre: number | null
  precio: number | null
}

const PISTAS_CODIGO = ['codigo', 'código', 'cod', 'sku', 'code']
const PISTAS_NOMBRE = ['nombre', 'descripcion', 'descripción', 'producto', 'articulo', 'artículo', 'detalle']
const PISTAS_PRECIO = ['precio', 'price', 'importe', 'costo', 'pvp']

function indiceQueContiene(headers: string[], pistas: string[]): number | null {
  const normalizados = headers.map((h) => normalizarNombre(h))
  for (const pista of pistas) {
    const i = normalizados.findIndex((h) => h.includes(pista))
    if (i !== -1) return i
  }
  return null
}

export function detectarColumnas(headers: string[]): ColumnasDetectadas {
  return {
    codigo: indiceQueContiene(headers, PISTAS_CODIGO),
    nombre: indiceQueContiene(headers, PISTAS_NOMBRE),
    precio: indiceQueContiene(headers, PISTAS_PRECIO),
  }
}

async function listarTodosLosProductos(): Promise<Producto[]> {
  const supabase = createClient()
  const productos: Producto[] = []
  let desde = 0
  while (true) {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .range(desde, desde + TAMANO_PAGINA - 1)
    if (error) throw error
    const pagina = data as Producto[]
    productos.push(...pagina)
    if (pagina.length < TAMANO_PAGINA) break
    desde += TAMANO_PAGINA
  }
  return productos
}

export interface FilaListaPrecio {
  codigo: string
  nombre: string
  precio: number
}

export interface ResultadoImportacion {
  total: number
  emparejadosPorCodigo: number
  emparejadosPorNombre: number
  sinMatch: string[]
}

export async function importarListaPrecios(
  proveedorId: string,
  filas: FilaListaPrecio[]
): Promise<ResultadoImportacion> {
  const productos = await listarTodosLosProductos()
  const porCodigo = new Map<string, Producto>()
  for (const p of productos) {
    if (p.codigo) porCodigo.set(p.codigo.trim().toLowerCase(), p)
    if (p.codigo_barras) porCodigo.set(p.codigo_barras.trim().toLowerCase(), p)
  }
  const porNombre = new Map<string, Producto>()
  for (const p of productos) {
    porNombre.set(normalizarNombre(p.nombre), p)
  }

  const filasAInsertar: { proveedor_id: string; producto_id: string; precio: number }[] = []
  const sinMatch: string[] = []
  let emparejadosPorCodigo = 0
  let emparejadosPorNombre = 0

  for (const fila of filas) {
    if (!fila.nombre && !fila.codigo) continue
    let producto: Producto | undefined
    if (fila.codigo) {
      producto = porCodigo.get(fila.codigo.trim().toLowerCase())
      if (producto) emparejadosPorCodigo++
    }
    if (!producto && fila.nombre) {
      producto = porNombre.get(normalizarNombre(fila.nombre))
      if (producto) emparejadosPorNombre++
    }
    if (!producto) {
      sinMatch.push(fila.nombre || fila.codigo)
      continue
    }
    filasAInsertar.push({ proveedor_id: proveedorId, producto_id: producto.id, precio: fila.precio })
  }

  const supabase = createClient()
  const LOTE = 500
  for (let i = 0; i < filasAInsertar.length; i += LOTE) {
    const lote = filasAInsertar.slice(i, i + LOTE).map((f) => ({ ...f, actualizado_en: new Date().toISOString() }))
    const { error } = await supabase
      .from('precios_proveedor')
      .upsert(lote as never, { onConflict: 'proveedor_id,producto_id' })
    if (error) throw error
  }

  return {
    total: filas.length,
    emparejadosPorCodigo,
    emparejadosPorNombre,
    sinMatch,
  }
}

export interface FilaComparador {
  producto: Producto
  precios: { proveedor: Proveedor; precio: number; actualizadoEn: string }[]
  mejor: { proveedor: Proveedor; precio: number } | null
}

export async function listarComparador(): Promise<FilaComparador[]> {
  const supabase = createClient()
  const [productos, proveedoresRes] = await Promise.all([listarTodosLosProductos(), supabase.from('proveedores').select('*')])
  if (proveedoresRes.error) throw proveedoresRes.error
  const proveedores = proveedoresRes.data as Proveedor[]
  const proveedoresPorId = new Map(proveedores.map((p) => [p.id, p]))

  const precios: PrecioProveedor[] = []
  let desde = 0
  while (true) {
    const { data, error } = await supabase.from('precios_proveedor').select('*').range(desde, desde + TAMANO_PAGINA - 1)
    if (error) throw error
    const pagina = data as PrecioProveedor[]
    precios.push(...pagina)
    if (pagina.length < TAMANO_PAGINA) break
    desde += TAMANO_PAGINA
  }

  const preciosPorProducto = new Map<string, PrecioProveedor[]>()
  for (const precio of precios) {
    const lista = preciosPorProducto.get(precio.producto_id) ?? []
    lista.push(precio)
    preciosPorProducto.set(precio.producto_id, lista)
  }

  const filas: FilaComparador[] = []
  for (const producto of productos) {
    const preciosProducto = preciosPorProducto.get(producto.id)
    if (!preciosProducto || preciosProducto.length === 0) continue
    const precios = preciosProducto
      .map((pp) => {
        const proveedor = proveedoresPorId.get(pp.proveedor_id)
        if (!proveedor) return null
        return { proveedor, precio: pp.precio, actualizadoEn: pp.actualizado_en }
      })
      .filter((x): x is { proveedor: Proveedor; precio: number; actualizadoEn: string } => x !== null)
    if (precios.length === 0) continue
    const mejor = precios.reduce((min, p) => (p.precio < min.precio ? p : min), precios[0])
    filas.push({ producto, precios, mejor: { proveedor: mejor.proveedor, precio: mejor.precio } })
  }

  return filas.sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre))
}
