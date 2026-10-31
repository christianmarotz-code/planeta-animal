import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Cuenta una llamada del usuario logueado a `endpoint` y devuelve una respuesta 429
 * si ya superó `max` llamadas en los últimos `ventanaSegundos`. Devuelve null si puede seguir.
 * Usa la función SQL consumir_cupo (migración 0038), así que el límite vale entre instancias serverless.
 *
 * Si la base falla, deja pasar la llamada y lo registra: un hipo de Supabase no debe tirar la carga de boletas.
 */
export async function limitarUso(
  endpoint: string,
  max: number,
  ventanaSegundos: number
): Promise<NextResponse | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('consumir_cupo', {
    p_endpoint: endpoint,
    p_max: max,
    p_ventana_segundos: ventanaSegundos,
  } as never)

  if (error) {
    console.error('No se pudo verificar el límite de uso:', error)
    return null
  }
  if (data === false) {
    return NextResponse.json(
      { ok: false, error: 'Hiciste demasiadas solicitudes seguidas. Esperá unos minutos e intentá de nuevo.' },
      { status: 429 }
    )
  }
  return null
}
