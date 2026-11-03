import { normalizarTelefono, numeroParaEnviar } from './telefono'
import type { RegistroMensaje, ResultadoRegistro } from './registro'

export type PedidoEnvio =
  | { tipo: 'conversacion'; conversacionId: string; texto: string }
  | { tipo: 'pedido'; telefono: string; proveedorId: string; texto: string }
  | { tipo: 'reintento'; mensajeId: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TEXTO = 4096
const ERROR_GATEWAY = 'No se pudo enviar el mensaje. Revisá la conexión de WhatsApp e intentá de nuevo.'

export function validarPedidoEnvio(body: unknown): PedidoEnvio | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Datos inválidos' }
  const b = body as Record<string, unknown>

  if (typeof b.mensajeId === 'string' && UUID.test(b.mensajeId)) {
    return { tipo: 'reintento', mensajeId: b.mensajeId }
  }

  const texto = typeof b.texto === 'string' ? b.texto.trim() : ''
  if (texto.length < 1 || texto.length > MAX_TEXTO) return { error: 'El mensaje está vacío o es demasiado largo.' }

  if (b.origen === 'pedido') {
    if (
      typeof b.telefono !== 'string' ||
      b.telefono.length > 40 ||
      typeof b.proveedorId !== 'string' ||
      !UUID.test(b.proveedorId)
    ) {
      return { error: 'Datos inválidos' }
    }
    return { tipo: 'pedido', telefono: b.telefono, proveedorId: b.proveedorId, texto }
  }

  if (typeof b.conversacionId === 'string' && UUID.test(b.conversacionId)) {
    return { tipo: 'conversacion', conversacionId: b.conversacionId, texto }
  }
  return { error: 'Datos inválidos' }
}

export interface DepsEnvio {
  telefonoDeConversacion(conversacionId: string): Promise<string | null>
  mensajeParaReintento(
    mensajeId: string
  ): Promise<{ id: string; texto: string; conversacionId: string } | null>
  enviarTexto(numero: string, texto: string): Promise<{ waMessageId: string | null }>
  registrar(m: RegistroMensaje): Promise<ResultadoRegistro>
  marcarMensaje(
    mensajeId: string,
    cambios: { estado: 'enviado' | 'error'; waMessageId: string | null }
  ): Promise<void>
}

interface Respuesta {
  status: number
  cuerpo: Record<string, unknown>
}

const noEncontrado = (): Respuesta => ({
  status: 404,
  cuerpo: { ok: false, error: 'No se encontró la conversación o el mensaje.' },
})

export async function ejecutarEnvio(
  pedido: PedidoEnvio,
  usuarioId: string,
  deps: DepsEnvio
): Promise<Respuesta> {
  if (pedido.tipo === 'reintento') {
    const mensaje = await deps.mensajeParaReintento(pedido.mensajeId)
    if (!mensaje) return noEncontrado()
    const telefono = await deps.telefonoDeConversacion(mensaje.conversacionId)
    if (!telefono) return noEncontrado()
    try {
      const { waMessageId } = await deps.enviarTexto(telefono, mensaje.texto)
      await deps.marcarMensaje(mensaje.id, { estado: 'enviado', waMessageId })
    } catch (err) {
      console.error('Falló el reintento de WhatsApp:', err)
      return { status: 502, cuerpo: { ok: false, error: ERROR_GATEWAY } }
    }
    return { status: 200, cuerpo: { ok: true, mensajeId: mensaje.id } }
  }

  let numero: string | null
  let proveedorId: string | null = null
  if (pedido.tipo === 'conversacion') {
    numero = await deps.telefonoDeConversacion(pedido.conversacionId)
    if (!numero) return noEncontrado()
  } else {
    numero = numeroParaEnviar(pedido.telefono)
    if (!numero) {
      return {
        status: 400,
        cuerpo: { ok: false, error: 'Revisá el teléfono del proveedor: no parece un celular argentino.' },
      }
    }
    proveedorId = pedido.proveedorId
  }

  const normalizado = normalizarTelefono(numero)
  if (!normalizado) return noEncontrado()

  const base: RegistroMensaje = {
    telefono: normalizado.digitos,
    clave: normalizado.clave,
    nombre: null,
    direccion: 'saliente',
    texto: pedido.texto,
    origen: pedido.tipo === 'pedido' ? 'pedido' : 'manual',
    estado: 'enviado',
    waMessageId: null,
    enviadoPor: usuarioId,
    reglaTipo: null,
    proveedorId,
  }

  let waMessageId: string | null
  try {
    ;({ waMessageId } = await deps.enviarTexto(numero, pedido.texto))
  } catch (err) {
    console.error('Falló el envío de WhatsApp:', err)
    const guardado = await deps.registrar({ ...base, estado: 'error' })
    return {
      status: 502,
      cuerpo: {
        ok: false,
        error: ERROR_GATEWAY,
        mensajeId: guardado.mensajeId,
        conversacionId: guardado.conversacionId,
      },
    }
  }

  const guardado = await deps.registrar({ ...base, waMessageId })
  return {
    status: 200,
    cuerpo: { ok: true, mensajeId: guardado.mensajeId, conversacionId: guardado.conversacionId },
  }
}
