import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requerirAdministrador } from '@/lib/auth/requerirAdministrador'
import type { Perfil, RolPerfil } from '@/types/database'

// El detalle del error queda en los logs del servidor; al cliente solo le llega un texto genérico.
function errorInterno(accion: string, err: unknown) {
  console.error(`Error al ${accion}:`, err)
  return NextResponse.json({ error: `No se pudo ${accion}. Intentá de nuevo.` }, { status: 500 })
}

export async function GET() {
  const { error } = await requerirAdministrador()
  if (error) return error

  const admin = createAdminClient()
  const { data: authData, error: errorAuth } = await admin.auth.admin.listUsers()
  if (errorAuth) return errorInterno('listar usuarios', errorAuth)

  const { data: perfiles, error: errorPerfiles } = await admin.from('perfiles').select('*')
  if (errorPerfiles) return errorInterno('listar perfiles', errorPerfiles)

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
  if (errorInvitar) return errorInterno('invitar al usuario', errorInvitar)

  const { error: errorPerfil } = await admin
    .from('perfiles')
    .insert({ id: invitado.user.id, nombre, avatar_url: null, rol } as never)
  if (errorPerfil) {
    // Evitar una cuenta huérfana: el usuario ya recibió el mail de invitación
    // pero no tiene perfil. Mejor esfuerzo — si el borrado también falla, el
    // admin ya ve el error del insert original y puede reintentar la invitación.
    await admin.auth.admin.deleteUser(invitado.user.id).catch(() => {})
    return errorInterno('crear el perfil del usuario', errorPerfil)
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const { error, user } = await requerirAdministrador()
  if (error) return error

  const { id } = (await request.json()) as { id: string }
  if (!id) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  if (id === user.id) {
    return NextResponse.json({ error: 'No podés eliminar tu propio usuario.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error: errorBorrar } = await admin.auth.admin.deleteUser(id)
  if (errorBorrar) {
    const tieneHistorial = /foreign key|violates|database error/i.test(errorBorrar.message)
    if (!tieneHistorial) return errorInterno('eliminar al usuario', errorBorrar)
    return NextResponse.json(
      { error: 'Este usuario ya cargó datos y no se puede eliminar todavía. Falta aplicar la migración 0033.' },
      { status: 409 }
    )
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
  if (errorUpdate) return errorInterno('cambiar el rol', errorUpdate)

  return NextResponse.json({ ok: true })
}
