import { timingSafeEqual } from 'node:crypto'
import { interpretarEvento } from './entrante'
import { normalizarTelefono } from './telefono'
import type { RegistroMensaje, ResultadoRegistro } from './registro'

/** Compara el secreto de la URL con el configurado, sin filtrar información por tiempo de respuesta. */
export function secretoValido(recibido: string, esperado: string | undefined): boolean {
  if (!esperado || esperado.length < 24) return false
  const a = Buffer.from(recibido)
  const b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface MensajeProcesado {
  resultado: ResultadoRegistro
  telefono: string
  clave: string
  propio: boolean
}

/** Traduce un aviso del gateway y lo guarda. Devuelve null si no hay nada que guardar. */
export async function procesarWebhook(
  body: unknown,
  registrar: (m: RegistroMensaje) => Promise<ResultadoRegistro>
): Promise<MensajeProcesado | null> {
  const evento = interpretarEvento(body)
  if (evento.tipo !== 'mensaje') return null
  const telefono = normalizarTelefono(evento.jid)
  if (!telefono) return null

  const resultado = await registrar({
    telefono: telefono.digitos,
    clave: telefono.clave,
    nombre: evento.nombre,
    direccion: evento.propio ? 'saliente' : 'entrante',
    texto: evento.texto,
    origen: evento.propio ? 'manual' : 'entrante',
    estado: 'enviado',
    waMessageId: evento.waMessageId,
    enviadoPor: null,
    reglaTipo: null,
    proveedorId: null,
  })
  return { resultado, telefono: telefono.digitos, clave: telefono.clave, propio: evento.propio }
}
