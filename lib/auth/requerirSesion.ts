import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type ResultadoSesion =
  | { error: NextResponse; user?: undefined }
  | { error?: undefined; user: { id: string } }

/** Exige solo una sesión iniciada (empleado o administrador). */
export async function requerirSesion(): Promise<ResultadoSesion> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  }
  return { user }
}
