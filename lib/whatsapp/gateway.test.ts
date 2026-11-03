import { describe, it, expect, vi } from 'vitest'
import { consultarConexion, enviarTexto, leerConfigGateway, obtenerQr, ErrorGateway } from './gateway'

const cfg = { url: 'https://gw.test', apiKey: 'clave', instancia: 'planeta' }

function respuesta(cuerpo: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({ ok, status, json: async () => cuerpo }) as unknown as typeof fetch
}

describe('leerConfigGateway', () => {
  it('devuelve null si falta algo', () => {
    expect(leerConfigGateway({ WHATSAPP_GATEWAY_URL: 'https://gw.test' })).toBeNull()
  })
  it('quita la barra final de la URL', () => {
    expect(
      leerConfigGateway({
        WHATSAPP_GATEWAY_URL: 'https://gw.test/',
        WHATSAPP_GATEWAY_API_KEY: 'k',
        WHATSAPP_INSTANCE: 'planeta',
      })
    ).toEqual({ url: 'https://gw.test', apiKey: 'k', instancia: 'planeta' })
  })
})

describe('enviarTexto', () => {
  it('manda number y text con la apikey y devuelve el id', async () => {
    const f = respuesta({ key: { id: 'WA1' } })
    const r = await enviarTexto(cfg, '5491112345678', 'hola', f)
    expect(r).toEqual({ waMessageId: 'WA1' })
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://gw.test/message/sendText/planeta')
    expect(init.method).toBe('POST')
    expect(init.headers.apikey).toBe('clave')
    expect(JSON.parse(init.body)).toEqual({ number: '5491112345678', text: 'hola' })
  })
  it('lanza ErrorGateway si el gateway responde con error', async () => {
    await expect(enviarTexto(cfg, '5491112345678', 'hola', respuesta({}, false, 500))).rejects.toBeInstanceOf(
      ErrorGateway
    )
  })
  it('lanza ErrorGateway si no hay conexión', async () => {
    const f = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch
    await expect(enviarTexto(cfg, '5491112345678', 'hola', f)).rejects.toBeInstanceOf(ErrorGateway)
  })
})

describe('consultarConexion', () => {
  it.each([
    ['open', 'abierta'],
    ['connecting', 'conectando'],
    ['close', 'cerrada'],
    ['raro', 'desconocido'],
  ])('traduce %s', async (estado, esperado) => {
    expect(await consultarConexion(cfg, respuesta({ instance: { state: estado } }))).toBe(esperado)
  })
})

describe('obtenerQr', () => {
  it('toma la imagen de base64 o de qrcode.base64', async () => {
    expect(await obtenerQr(cfg, respuesta({ base64: 'data:image/png;base64,AAA' }))).toBe('data:image/png;base64,AAA')
    expect(await obtenerQr(cfg, respuesta({ qrcode: { base64: 'data:image/png;base64,BBB' } }))).toBe(
      'data:image/png;base64,BBB'
    )
  })
  it('devuelve null si no hay imagen', async () => {
    expect(await obtenerQr(cfg, respuesta({ count: 0 }))).toBeNull()
  })
})
