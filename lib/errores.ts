/**
 * Convierte cualquier error en un texto para mostrar en pantalla.
 *
 * Los errores de Supabase son objetos planos ({ code, message }), no instancias
 * de Error, así que `err instanceof Error` los descarta y se pierde la causa.
 */
export function mensajeDeError(err: unknown, fallback: string): string {
  console.error(err)

  const { code, message } = datosDeError(err)

  // Excepciones que lanzan nuestras funciones SQL (`raise exception '...'`):
  // ya vienen redactadas para el usuario.
  if (code === 'P0001' && message) return message
  if (code === '42501') return 'No tenés permiso para hacer esto.'
  if (code === '23505') return 'Ya existe un registro con esos datos.'
  if (code === '23503') return 'No se puede porque está en uso por otros registros.'

  if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    return 'Sin conexión. Revisá internet e intentá de nuevo.'
  }
  // Error propio de nuestro código o de nuestras APIs (ya redactado).
  if (err instanceof Error && !code) return err.message || fallback

  return message ? `${fallback} (${message})` : fallback
}

function datosDeError(err: unknown): { code?: string; message?: string } {
  if (typeof err !== 'object' || err === null) return {}
  const { code, message } = err as { code?: unknown; message?: unknown }
  return {
    code: typeof code === 'string' ? code : undefined,
    message: typeof message === 'string' && message ? message : undefined,
  }
}
