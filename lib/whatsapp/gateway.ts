// Único lugar que sabe cómo hablarle al gateway de WhatsApp (Evolution API). Solo para el servidor.
export interface ConfigGateway {
  url: string
  apiKey: string
  instancia: string
}

export type EstadoConexion = 'abierta' | 'conectando' | 'cerrada' | 'desconocido'

export class ErrorGateway extends Error {}

export function leerConfigGateway(
  env: Record<string, string | undefined> = process.env
): ConfigGateway | null {
  const url = env.WHATSAPP_GATEWAY_URL?.replace(/\/+$/, '')
  const apiKey = env.WHATSAPP_GATEWAY_API_KEY
  const instancia = env.WHATSAPP_INSTANCE
  return url && apiKey && instancia ? { url, apiKey, instancia } : null
}

async function pedir(
  cfg: ConfigGateway,
  ruta: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
  fetchFn: typeof fetch
): Promise<Record<string, unknown>> {
  let res: Response
  try {
    res = await fetchFn(`${cfg.url}${ruta}`, {
      method: init.method,
      headers: { 'Content-Type': 'application/json', apikey: cfg.apiKey },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(8000),
    })
  } catch (err) {
    throw new ErrorGateway('No se pudo conectar con el gateway', { cause: err })
  }
  if (!res.ok) throw new ErrorGateway(`El gateway respondió ${res.status}`)
  const cuerpo = await res.json().catch(() => ({}))
  return cuerpo && typeof cuerpo === 'object' ? (cuerpo as Record<string, unknown>) : {}
}

function anidado(obj: unknown, ...camino: string[]): unknown {
  let actual: unknown = obj
  for (const clave of camino) {
    if (!actual || typeof actual !== 'object') return undefined
    actual = (actual as Record<string, unknown>)[clave]
  }
  return actual
}

export async function enviarTexto(
  cfg: ConfigGateway,
  numero: string,
  texto: string,
  fetchFn: typeof fetch = fetch
): Promise<{ waMessageId: string | null }> {
  const cuerpo = await pedir(
    cfg,
    `/message/sendText/${encodeURIComponent(cfg.instancia)}`,
    { method: 'POST', body: { number: numero, text: texto } },
    fetchFn
  )
  const id = anidado(cuerpo, 'key', 'id')
  return { waMessageId: typeof id === 'string' ? id : null }
}

export async function consultarConexion(
  cfg: ConfigGateway,
  fetchFn: typeof fetch = fetch
): Promise<EstadoConexion> {
  const cuerpo = await pedir(
    cfg,
    `/instance/connectionState/${encodeURIComponent(cfg.instancia)}`,
    { method: 'GET' },
    fetchFn
  )
  const estado = anidado(cuerpo, 'instance', 'state')
  if (estado === 'open') return 'abierta'
  if (estado === 'connecting') return 'conectando'
  if (estado === 'close') return 'cerrada'
  return 'desconocido'
}

/** Imagen del QR (data URI en base64) para vincular el celular, o null si el gateway no la tiene. */
export async function obtenerQr(
  cfg: ConfigGateway,
  fetchFn: typeof fetch = fetch
): Promise<string | null> {
  const cuerpo = await pedir(
    cfg,
    `/instance/connect/${encodeURIComponent(cfg.instancia)}`,
    { method: 'GET' },
    fetchFn
  )
  const imagen = cuerpo.base64 ?? anidado(cuerpo, 'qrcode', 'base64')
  return typeof imagen === 'string' && imagen.startsWith('data:image') ? imagen : null
}
