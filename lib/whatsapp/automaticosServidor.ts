import type { createAdminClient } from '@/lib/supabase/admin'
import type { ReglaWhatsapp, TipoReglaWhatsapp } from '@/types/database'
import type { DepsAutomaticos } from './automaticos'
import { enviarTexto, type ConfigGateway } from './gateway'
import { registrarMensaje } from './registro'

export function depsAutomaticosReales(
  admin: ReturnType<typeof createAdminClient>,
  cfg: ConfigGateway
): DepsAutomaticos {
  return {
    async cargarConfig() {
      const [config, reglas] = await Promise.all([
        admin.from('whatsapp_config').select('automaticos_activos').maybeSingle(),
        admin.from('whatsapp_reglas').select('*'),
      ])
      return {
        interruptor: (config.data as { automaticos_activos: boolean } | null)?.automaticos_activos ?? false,
        reglas: (reglas.data ?? []) as ReglaWhatsapp[],
      }
    },
    async ultimosEnvios(conversacionId) {
      const { data } = await admin
        .from('whatsapp_mensajes')
        .select('regla_tipo, creado_en')
        .eq('conversacion_id', conversacionId)
        .eq('origen', 'automatico')
        .neq('estado', 'error')
        .order('creado_en', { ascending: false })
        .limit(10)
      const ultimos: Partial<Record<TipoReglaWhatsapp, Date>> = {}
      for (const fila of (data ?? []) as { regla_tipo: TipoReglaWhatsapp | null; creado_en: string }[]) {
        if (fila.regla_tipo && !ultimos[fila.regla_tipo]) ultimos[fila.regla_tipo] = new Date(fila.creado_en)
      }
      return ultimos
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
    dormir: (ms) => new Promise((resolver) => setTimeout(resolver, ms)),
    ahora: () => new Date(),
  }
}
