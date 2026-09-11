import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requerirAdministrador } from '@/lib/auth/requerirAdministrador'
import type { Perfil, RolPerfil } from '@/types/database'

export async function GET() {
  const { error } = await requerirAdministrador()
  if (error) return error

  const admin = createAdminClient()
  const { data: authData, error: errorAuth } = await admin.auth.admin.listUsers()
  if (errorAuth) return NextResponse.json({ error: errorAuth.message }, { status: 500 })

  const { data: perfiles, error: errorPerfiles } = await admin.from('perfiles').select('*')
  if (errorPerfiles) return NextResponse.json({ error: errorPerfiles.message }, { status: 500 })

  const usuarios = ((perfiles ?? []) as Perfil[]).map((perfil) => {
    const authUser = authData.users.find((u) => u.id === perfil.id)
    return {
      id: perfil.id,
      email: authUser?.email ?? '—',
      nombre: perfil.nombre,
      rol: perfil.rol,
    }
  })

  return NextResponse.json({ usuarios })
}

export async function POST(request: Request) {
  const { error } = await requerirAdministrador()
  if (error) return error

  const body = await request.json()
  const { email, nombre, rol } = body as { email: string; nombre: string; rol: RolPerfil }
  if (!email || !nombre || (rol !== 'administrador' && rol !== 'empleado')) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: invitado, error: errorInvitar } = await admin.auth.admin.inviteUserByEmail(email)
  if (errorInvitar) return NextResponse.json({ error: errorInvitar.message }, { status: 500 })

  const { error: errorPerfil } = await admin
    .from('perfiles')
    .insert({ id: invitado.user.id, nombre, avatar_url: null, rol } as never)
  if (errorPerfil) {
    // Evitar una cuenta huérfana: el usuario ya recibió el mail de invitación
    // pero no tiene perfil. Mejor esfuerzo — si el borrado también falla, el
    // admin ya ve el error del insert original y puede reintentar la invitación.
    await admin.auth.admin.deleteUser(invitado.user.id).catch(() => {})
    return NextResponse.json({ error: errorPerfil.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function PATCH(request: Request) {
  const { error, user } = await requerirAdministrador()
  if (error) return error

  const body = await request.json()
  const { id, rol } = body as { id: string; rol: RolPerfil }
  if (!id || (rol !== 'administrador' && rol !== 'empleado')) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }
  if (id === user.id) {
    return NextResponse.json({ error: 'No podés cambiar tu propio rol.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error: errorUpdate } = await admin.from('perfiles').update({ rol } as never).eq('id', id)
  if (errorUpdate) return NextResponse.json({ error: errorUpdate.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
