import type { BoletaExtraida } from '@/lib/facturas/boletaExtraida'
import type { ProveedorDeclarado } from '@/lib/facturas/promptExtractor'

export type ResultadoExtraccion =
  | { ok: true; boleta: BoletaExtraida; hash_imagen: string; factura_duplicada_id: string | null }
  | { ok: false; error: string }

const ERROR_GENERICO = 'No se pudo leer la boleta automáticamente.'

/** Pide la lectura de una o varias páginas (rutas ya subidas a Storage) del mismo comprobante. */
export async function extraerBoleta(
  rutasArchivo: string[],
  proveedor: ProveedorDeclarado
): Promise<ResultadoExtraccion> {
  const respuesta = await fetch('/api/boletas/extraer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rutas_archivo: rutasArchivo, proveedor_declarado: proveedor }),
  })
  if (!respuesta.ok) return { ok: false, error: ERROR_GENERICO }
  const datos = await respuesta.json()
  if (!datos.ok) return { ok: false, error: datos.error ?? ERROR_GENERICO }
  return {
    ok: true,
    boleta: datos.boleta as BoletaExtraida,
    hash_imagen: datos.hash_imagen as string,
    factura_duplicada_id: (datos.factura_duplicada_id as string | null) ?? null,
  }
}
