// Único lugar que conoce la forma de los avisos (webhooks) del gateway.
export type EventoWhatsapp =
  | {
      tipo: 'mensaje'
      waMessageId: string
      jid: string
      nombre: string | null
      texto: string
      propio: boolean
    }
  | { tipo: 'ignorado'; motivo: string }

const TIPOS_IGNORADOS = new Set([
  'reactionMessage',
  'protocolMessage',
  'senderKeyDistributionMessage',
  'editedMessage',
])

const ADJUNTOS: Record<string, string> = {
  imageMessage: '📷 Imagen',
  audioMessage: '🎤 Audio',
  videoMessage: '🎥 Video',
  documentMessage: '📄 Documento',
  stickerMessage: '🙂 Sticker',
  contactMessage: '👤 Contacto',
  locationMessage: '📍 Ubicación',
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null
}

function cadena(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null
}

function ignorado(motivo: string): EventoWhatsapp {
  return { tipo: 'ignorado', motivo }
}

export function interpretarEvento(body: unknown): EventoWhatsapp {
  const raiz = objeto(body)
  if (!raiz) return ignorado('cuerpo inválido')

  const evento = (cadena(raiz.event) ?? '').toLowerCase().replace(/_/g, '.')
  if (evento !== 'messages.upsert') return ignorado(`evento ${evento || 'desconocido'}`)

  const data = objeto(raiz.data)
  const key = objeto(data?.key)
  const id = cadena(key?.id)
  let jid = cadena(key?.remoteJid)
  if (!data || !key || !id || !jid) return ignorado('mensaje sin clave')

  // WhatsApp a veces esconde el número detrás de un identificador interno (@lid).
  if (jid.endsWith('@lid')) jid = cadena(key.remoteJidAlt) ?? jid
  if (!jid.endsWith('@s.whatsapp.net')) return ignorado('no es un chat individual')

  const mensaje = objeto(data.message)
  if (!mensaje) return ignorado('sin contenido')

  const tipoMensaje = cadena(data.messageType) ?? Object.keys(mensaje)[0] ?? ''
  if (TIPOS_IGNORADOS.has(tipoMensaje)) return ignorado(`tipo ${tipoMensaje}`)

  const propio = key.fromMe === true
  const texto =
    cadena(mensaje.conversation) ??
    cadena(objeto(mensaje.extendedTextMessage)?.text) ??
    descripcionDeAdjunto(tipoMensaje, mensaje)

  return {
    tipo: 'mensaje',
    waMessageId: id,
    jid,
    nombre: propio ? null : cadena(data.pushName),
    texto,
    propio,
  }
}

function descripcionDeAdjunto(tipo: string, mensaje: Record<string, unknown>): string {
  const base = ADJUNTOS[tipo]
  if (!base) return '📎 Mensaje no compatible'
  const epigrafe = cadena(objeto(mensaje[tipo])?.caption)
  return epigrafe ? `${base}: ${epigrafe}` : base
}
