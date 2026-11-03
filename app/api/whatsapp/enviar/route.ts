import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { limitarUso } from '@/lib/auth/limitarUso'
import { requerirAdministrador } from '@/lib/auth/requerirAdministrador'
import { requerirSesion } from '@/lib/auth/requerirSesion'
import { ejecutarEnvio, validarPedidoEnvio, type DepsEnvio } from '@/lib/whatsapp/envio'
import { enviarTexto, leerConfigGateway } from '@/lib/whatsapp/gateway'
import { registrarMensaje } from '@/lib/whatsapp/registro'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const pedido = validarPedidoEnvio(body)
  if ('error' in pedido) return NextResponse.json({ ok: false, error: pedido.error }, { status: 400 })

  // Los pedidos a proveedores nacen en Reposición, que es solo de administradores.
  const auth = pedido.tipo === 'pedido' ? await requerirAdministrador() : await requerirSesion()
  if (auth.error) return auth.error

  const limite = await limitarUso('whatsapp-enviar', 30, 60)
  if (limite) return limite

  const cfg = leerConfigGateway()
  if (!cfg) {
    return NextResponse.json({ ok: false, error: 'WhatsApp todavía no está configurado.' }, { status: 503 })
  }

  const admin = createAdminClient()
  const deps: DepsEnvio = {
    async telefonoDeConversacion(id) {
      const { data } = await admin.from('whatsapp_conversaciones').select('telefono').eq('id', id).maybeSingle()
      return (data as { telefono: string } | null)?.telefono ?? null
    },
    async mensajeParaReintento(id) {
      const { data } = await admin
        .from('whatsapp_mensajes')
        .select('id, texto, conversacion_id')
        .eq('id', id)
        .eq('direccion', 'saliente')
        .eq('estado', 'error')
        .maybeSingle()
      const fila = data as { id: string; texto: string; conversacion_id: string } | null
      return fila ? { id: fila.id, texto: fila.texto, conversacionId: fila.conversacion_id } : null
    },
    enviarTexto: (numero, texto) => enviarTexto(cfg, numero, texto),
    registrar: (m) => registrarMensaje(admin, m),
    async marcarMensaje(id, cambios) {
      const { error } = await admin
        .from('whatsapp_mensajes')
        .update({ estado: cambios.estado, wa_message_id: cambios.waMessageId } as never)
        .eq('id', id)
      if (error) throw error
    },
  }

  try {
    const { status, cuerpo } = await ejecutarEnvio(pedido, auth.user.id, deps)
    return NextResponse.json(cuerpo, { status })
  } catch (err) {
    console.error('Error al enviar el mensaje de WhatsApp:', err)
    return NextResponse.json(
      { ok: false, error: 'No se pudo enviar el mensaje. Intentá de nuevo.' },
      { status: 500 }
    )
  }
}
