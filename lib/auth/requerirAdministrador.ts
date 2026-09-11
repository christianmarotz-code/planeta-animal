import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { RolPerfil } from '@/types/database'

type ResultadoAuth =
  | { error: NextResponse; user?: undefined }
  | { error?: undefined; user: { id: string } }

export async function requerirAdministrador(): Promise<ResultadoAuth> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  }

  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
  if ((perfil as { rol: RolPerfil } | null)?.rol !== 'administrador') {
    return { error: NextResponse.json({ error: 'Acceso restringido' }, { status: 403 }) }
  }
  return { user }
}
