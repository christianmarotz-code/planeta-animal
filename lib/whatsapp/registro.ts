import type { createAdminClient } from '@/lib/supabase/admin'
import type {
  DireccionMensaje,
  EstadoMensajeWhatsapp,
  OrigenMensajeWhatsapp,
  TipoReglaWhatsapp,
} from '@/types/database'

export interface RegistroMensaje {
  telefono: string
  clave: string
  nombre: string | null
  direccion: DireccionMensaje
  texto: string
  origen: OrigenMensajeWhatsapp
  estado: EstadoMensajeWhatsapp
  waMessageId: string | null
  enviadoPor: string | null
  reglaTipo: TipoReglaWhatsapp | null
  proveedorId: string | null
}

export interface ResultadoRegistro {
  conversacionId: string
  mensajeId: string
  esNuevo: boolean
  primeraVez: boolean
  proveedorId: string | null
  clienteId: string | null
}

interface FilaRegistro {
  conversacion_id: string
  mensaje_id: string
  es_nuevo: boolean
  primera_vez: boolean
  vinculo_proveedor_id: string | null
  vinculo_cliente_id: string | null
}

export async function registrarMensaje(
  admin: ReturnType<typeof createAdminClient>,
  m: RegistroMensaje
): Promise<ResultadoRegistro> {
  const { data, error } = await admin.rpc('whatsapp_registrar_mensaje', {
    p_telefono: m.telefono,
    p_clave: m.clave,
    p_nombre: m.nombre,
    p_direccion: m.direccion,
    p_texto: m.texto,
    p_origen: m.origen,
    p_estado: m.estado,
    p_wa_message_id: m.waMessageId,
    p_enviado_por: m.enviadoPor,
    p_regla_tipo: m.reglaTipo,
    p_proveedor_id: m.proveedorId,
  } as never)
  const fila = (data as FilaRegistro[] | null)?.[0]
  if (error || !fila) throw error ?? new Error('whatsapp_registrar_mensaje no devolvió filas')
  return {
    conversacionId: fila.conversacion_id,
    mensajeId: fila.mensaje_id,
    esNuevo: fila.es_nuevo,
    primeraVez: fila.primera_vez,
    proveedorId: fila.vinculo_proveedor_id,
    clienteId: fila.vinculo_cliente_id,
  }
}
