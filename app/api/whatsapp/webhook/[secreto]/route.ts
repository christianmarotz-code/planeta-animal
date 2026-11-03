import { after, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { responderAutomatico } from '@/lib/whatsapp/automaticos'
import { depsAutomaticosReales } from '@/lib/whatsapp/automaticosServidor'
import { leerConfigGateway } from '@/lib/whatsapp/gateway'
import { registrarMensaje } from '@/lib/whatsapp/registro'
import { procesarWebhook, secretoValido } from '@/lib/whatsapp/webhook'

// El gateway no tiene sesión de usuario: esta ruta se protege con el secreto que lleva en la URL
// (proxy.ts la deja pasar sin sesión). Responde 200 aunque ignore el aviso, para que el gateway no reintente.
export async function POST(request: Request, ctx: RouteContext<'/api/whatsapp/webhook/[secreto]'>) {
  const { secreto } = await ctx.params
  if (!secretoValido(secreto, process.env.WHATSAPP_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const admin = createAdminClient()
  try {
    const procesado = await procesarWebhook(body, (m) => registrarMensaje(admin, m))
    const cfg = leerConfigGateway()
    // Solo se responde a mensajes ajenos y nuevos; la pausa corre después de contestarle al gateway.
    if (procesado && cfg && !procesado.propio && procesado.resultado.esNuevo) {
      after(() =>
        responderAutomatico(
          {
            telefono: procesado.telefono,
            clave: procesado.clave,
            conversacionId: procesado.resultado.conversacionId,
            primeraVez: procesado.resultado.primeraVez,
            esProveedor: procesado.resultado.proveedorId !== null,
          },
          depsAutomaticosReales(admin, cfg)
        ).catch((err) => console.error('Falló la respuesta automática:', err))
      )
    }
  } catch (err) {
    // 500 para que el gateway reintente: guardar es idempotente por wa_message_id.
    console.error('No se pudo guardar el mensaje de WhatsApp:', err)
    return NextResponse.json({ error: 'No se pudo guardar el mensaje.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
