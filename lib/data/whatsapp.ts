import { createClient } from '@/lib/supabase/client'
import type {
  Cliente,
  ConfigWhatsapp,
  Conversacion,
  Mensaje,
  Proveedor,
  ReglaWhatsapp,
  TipoReglaWhatsapp,
} from '@/types/database'

export interface ConversacionConVinculo extends Conversacion {
  proveedor: Pick<Proveedor, 'id' | 'nombre'> | null
  cliente: Pick<Cliente, 'id' | 'nombre'> | null
}

export async function listarConversaciones(): Promise<ConversacionConVinculo[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('whatsapp_conversaciones')
    .select('*, proveedor:proveedores(id, nombre), cliente:clientes(id, nombre)')
    .order('ultimo_mensaje_en', { ascending: false })
  if (error) throw error
  return data as unknown as ConversacionConVinculo[]
}

export async function listarMensajes(conversacionId: string, limite = 300): Promise<Mensaje[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('whatsapp_mensajes')
    .select('*')
    .eq('conversacion_id', conversacionId)
    .order('creado_en', { ascending: false })
    .limit(limite)
  if (error) throw error
  return (data as Mensaje[]).reverse()
}

export async function marcarLeida(conversacionId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('whatsapp_conversaciones')
    .update({ no_leidos: 0 } as never)
    .eq('id', conversacionId)
    .gt('no_leidos', 0)
  if (error) throw error
}

/** Asocia el chat a un proveedor o cliente (o lo desvincula con null). Un chat tiene un solo vínculo. */
export async function vincularConversacion(
  id: string,
  destino: { proveedorId: string } | { clienteId: string } | null
): Promise<void> {
  const supabase = createClient()
  const cambios = {
    proveedor_id: destino && 'proveedorId' in destino ? destino.proveedorId : null,
    cliente_id: destino && 'clienteId' in destino ? destino.clienteId : null,
  }
  const { error } = await supabase.from('whatsapp_conversaciones').update(cambios as never).eq('id', id)
  if (error) throw error
}

function suscribirse(nombre: string, tabla: string, filtro: string | undefined, alCambiar: () => void) {
  const supabase = createClient()
  const canal = supabase
    .channel(nombre)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: tabla, ...(filtro ? { filter: filtro } : {}) },
      alCambiar
    )
    .subscribe()
  return () => {
    supabase.removeChannel(canal)
  }
}

export function suscribirseAConversaciones(alCambiar: () => void): () => void {
  return suscribirse('whatsapp-conversaciones', 'whatsapp_conversaciones', undefined, alCambiar)
}

export function suscribirseAMensajes(conversacionId: string, alCambiar: () => void): () => void {
  return suscribirse(
    `whatsapp-mensajes-${conversacionId}`,
    'whatsapp_mensajes',
    `conversacion_id=eq.${conversacionId}`,
    alCambiar
  )
}

export async function obtenerAutomaticos(): Promise<{ interruptor: boolean; reglas: ReglaWhatsapp[] }> {
  const supabase = createClient()
  const [config, reglas] = await Promise.all([
    supabase.from('whatsapp_config').select('*').maybeSingle(),
    supabase.from('whatsapp_reglas').select('*').order('tipo'),
  ])
  if (config.error) throw config.error
  if (reglas.error) throw reglas.error
  return {
    interruptor: (config.data as ConfigWhatsapp | null)?.automaticos_activos ?? false,
    reglas: reglas.data as ReglaWhatsapp[],
  }
}

export async function guardarInterruptor(activo: boolean): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('whatsapp_config')
    .update({ automaticos_activos: activo } as never)
    .eq('id', true)
  if (error) throw error
}

export async function guardarRegla(
  tipo: TipoReglaWhatsapp,
  cambios: Partial<Pick<ReglaWhatsapp, 'activa' | 'texto' | 'abre' | 'cierra' | 'dias'>>
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('whatsapp_reglas').update(cambios as never).eq('tipo', tipo)
  if (error) throw error
}
