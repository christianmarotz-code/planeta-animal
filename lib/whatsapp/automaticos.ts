import type { ReglaWhatsapp, TipoReglaWhatsapp } from '@/types/database'
import type { RegistroMensaje, ResultadoRegistro } from './registro'

const ZONA = 'America/Argentina/Buenos_Aires'
const DIAS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

const ENFRIAMIENTO_MS = 24 * 60 * 60 * 1000

function partesLocales(ahora: Date): { dia: number; minutos: number } {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ahora)
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? ''
  return { dia: DIAS[valor('weekday')] ?? 0, minutos: Number(valor('hour')) * 60 + Number(valor('minute')) }
}

function aMinutos(hora: string | null): number | null {
  const m = hora?.match(/^(\d{2}):(\d{2})/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** Con horario cargado, dice si el negocio está abierto en este momento (hora de Buenos Aires). */
export function estaAbierto(regla: ReglaWhatsapp, ahora: Date): boolean {
  const abre = aMinutos(regla.abre)
  const cierra = aMinutos(regla.cierra)
  if (abre === null || cierra === null) return true
  const { dia, minutos } = partesLocales(ahora)
  return regla.dias.includes(dia) && minutos >= abre && minutos < cierra
}

export interface ContextoAutomatico {
  ahora: Date
  interruptor: boolean
  primeraVez: boolean
  esProveedor: boolean
  ultimoEnvio: Partial<Record<TipoReglaWhatsapp, Date>>
}

export function elegirRegla(reglas: ReglaWhatsapp[], ctx: ContextoAutomatico): ReglaWhatsapp | null {
  if (!ctx.interruptor || ctx.esProveedor) return null
  const disponible = (tipo: TipoReglaWhatsapp) =>
    reglas.find((r) => {
      if (r.tipo !== tipo || !r.activa) return false
      const ultimo = ctx.ultimoEnvio[tipo]
      return !ultimo || ctx.ahora.getTime() - ultimo.getTime() >= ENFRIAMIENTO_MS
    })

  const fuera = disponible('fuera_de_horario')
  if (fuera && !estaAbierto(fuera, ctx.ahora)) return fuera
  return ctx.primeraVez ? (disponible('saludo_inicial') ?? null) : null
}

/** Pausa de 2 a 6 segundos para que la respuesta no salga con aspecto de robot. */
export function pausaAleatoriaMs(azar: () => number = Math.random): number {
  return 2000 + Math.floor(azar() * 4001)
}

export interface DepsAutomaticos {
  cargarConfig(): Promise<{ interruptor: boolean; reglas: ReglaWhatsapp[] }>
  ultimosEnvios(conversacionId: string): Promise<Partial<Record<TipoReglaWhatsapp, Date>>>
  enviarTexto(numero: string, texto: string): Promise<{ waMessageId: string | null }>
  registrar(m: RegistroMensaje): Promise<ResultadoRegistro>
  marcarMensaje(
    mensajeId: string,
    cambios: { estado: 'enviado' | 'error'; waMessageId: string | null }
  ): Promise<void>
  dormir(ms: number): Promise<void>
  ahora(): Date
}

export interface EntradaAutomatica {
  telefono: string
  clave: string
  conversacionId: string
  primeraVez: boolean
  esProveedor: boolean
}

/**
 * Responde a un mensaje entrante si alguna regla corresponde. Guarda el mensaje como "pendiente"
 * antes de esperar, así otro aviso que llegue en esos segundos ya ve el enfriamiento.
 * Nunca lanza: una respuesta automática fallida no debe afectar al resto.
 */
export async function responderAutomatico(
  entrada: EntradaAutomatica,
  deps: DepsAutomaticos
): Promise<TipoReglaWhatsapp | null> {
  const { interruptor, reglas } = await deps.cargarConfig()
  const regla = elegirRegla(reglas, {
    ahora: deps.ahora(),
    interruptor,
    primeraVez: entrada.primeraVez,
    esProveedor: entrada.esProveedor,
    ultimoEnvio: await deps.ultimosEnvios(entrada.conversacionId),
  })
  if (!regla) return null

  const guardado = await deps.registrar({
    telefono: entrada.telefono,
    clave: entrada.clave,
    nombre: null,
    direccion: 'saliente',
    texto: regla.texto,
    origen: 'automatico',
    estado: 'pendiente',
    waMessageId: null,
    enviadoPor: null,
    reglaTipo: regla.tipo,
    proveedorId: null,
  })

  try {
    await deps.dormir(pausaAleatoriaMs())
    const { waMessageId } = await deps.enviarTexto(entrada.telefono, regla.texto)
    await deps.marcarMensaje(guardado.mensajeId, { estado: 'enviado', waMessageId })
    return regla.tipo
  } catch (err) {
    console.error('Falló la respuesta automática de WhatsApp:', err)
    await deps.marcarMensaje(guardado.mensajeId, { estado: 'error', waMessageId: null }).catch(() => {})
    return null
  }
}
