import { createClient } from '@/lib/supabase/client'
import type { Perfil } from '@/types/database'

export async function obtenerOCrearPerfilActual(): Promise<Perfil> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { data: existente, error: errorSelect } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()
  if (errorSelect) throw errorSelect
  if (existente) return existente as Perfil

  const nombreDefault = user.email?.split('@')[0] ?? 'Usuario'
  const { data: creado, error } = await supabase
    .from('perfiles')
    .insert({ id: user.id, nombre: nombreDefault, avatar_url: null } as never)
    .select()
    .single()

  if (error) {
    // Carrera: otra pestaña ya creó el perfil entre el select y el insert.
    const { data: retry, error: errorRetry } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', user.id)
      .single()
    if (errorRetry) throw errorRetry
    return retry as Perfil
  }
  return creado as Perfil
}

export async function actualizarNombrePerfil(nombre: string): Promise<void> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { error } = await supabase.from('perfiles').update({ nombre } as never).eq('id', user.id)
  if (error) throw error
}

export async function subirAvatar(file: File): Promise<string> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const extension = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
  const ruta = `${user.id}/avatar.${extension}`

  const { error: errorSubida } = await supabase.storage
    .from('avatars')
    .upload(ruta, file, { upsert: true })
  if (errorSubida) throw errorSubida

  const {
    data: { publicUrl },
  } = supabase.storage.from('avatars').getPublicUrl(ruta)

  const urlConCacheBuster = `${publicUrl}?v=${Date.now()}`

  const { error: errorUpdate } = await supabase
    .from('perfiles')
    .update({ avatar_url: urlConCacheBuster } as never)
    .eq('id', user.id)
  if (errorUpdate) throw errorUpdate

  return urlConCacheBuster
}
