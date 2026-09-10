import type { RolPerfil } from '@/types/database'

export interface UsuarioConEmail {
  id: string
  email: string
  nombre: string
  rol: RolPerfil
}

async function parsearRespuesta(res: Response) {
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Error inesperado')
  return body
}

export async function listarUsuarios(): Promise<UsuarioConEmail[]> {
  const res = await fetch('/api/usuarios')
  const body = await parsearRespuesta(res)
  return body.usuarios
}

export async function invitarUsuario(input: {
  email: string
  nombre: string
  rol: RolPerfil
}): Promise<void> {
  const res = await fetch('/api/usuarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  await parsearRespuesta(res)
}

export async function actualizarRolUsuario(id: string, rol: RolPerfil): Promise<void> {
  const res = await fetch('/api/usuarios', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, rol }),
  })
  await parsearRespuesta(res)
}
