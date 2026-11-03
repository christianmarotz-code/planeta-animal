import { describe, it, expect, vi } from 'vitest'
import { ejecutarEnvio, validarPedidoEnvio, type DepsEnvio } from './envio'

const UUID = '11111111-1111-4111-8111-111111111111'

describe('validarPedidoEnvio', () => {
  it('acepta un mensaje a una conversación', () => {
    expect(validarPedidoEnvio({ conversacionId: UUID, texto: ' hola ' })).toEqual({
      tipo: 'conversacion',
      conversacionId: UUID,
      texto: 'hola',
    })
  })
  it('acepta un pedido a proveedor', () => {
    expect(
      validarPedidoEnvio({ origen: 'pedido', telefono: '11 4444-5555', proveedorId: UUID, texto: 'pedido' })
    ).toEqual({ tipo: 'pedido', telefono: '11 4444-5555', proveedorId: UUID, texto: 'pedido' })
  })
  it('acepta un reintento', () => {
    expect(validarPedidoEnvio({ mensajeId: UUID })).toEqual({ tipo: 'reintento', mensajeId: UUID })
  })
  it.each([
    [null],
    [{}],
    [{ conversacionId: 'no-es-uuid', texto: 'x' }],
    [{ conversacionId: UUID, texto: '   ' }],
    [{ conversacionId: UUID, texto: 'x'.repeat(4097) }],
    [{ origen: 'pedido', telefono: '1', texto: 'x' }],
  ])('rechaza %j', (cuerpo) => {
    expect('error' in validarPedidoEnvio(cuerpo)).toBe(true)
  })
})

function deps(sobre: Partial<DepsEnvio> = {}): DepsEnvio {
  return {
    telefonoDeConversacion: vi.fn().mockResolvedValue('5491112345678'),
    mensajeParaReintento: vi.fn().mockResolvedValue({ id: 'm9', texto: 'hola', conversacionId: 'c1' }),
    enviarTexto: vi.fn().mockResolvedValue({ waMessageId: 'WA1' }),
    registrar: vi.fn().mockResolvedValue({
      conversacionId: 'c1',
      mensajeId: 'm1',
      esNuevo: true,
      primeraVez: false,
      proveedorId: null,
      clienteId: null,
    }),
    marcarMensaje: vi.fn().mockResolvedValue(undefined),
    ...sobre,
  }
}

describe('ejecutarEnvio', () => {
  it('envía a una conversación y registra el mensaje con quién lo mandó', async () => {
    const d = deps()
    const r = await ejecutarEnvio({ tipo: 'conversacion', conversacionId: 'c1', texto: 'hola' }, 'user1', d)
    expect(r).toEqual({ status: 200, cuerpo: { ok: true, mensajeId: 'm1', conversacionId: 'c1' } })
    expect(d.enviarTexto).toHaveBeenCalledWith('5491112345678', 'hola')
    expect(d.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        direccion: 'saliente',
        origen: 'manual',
        estado: 'enviado',
        waMessageId: 'WA1',
        enviadoPor: 'user1',
      })
    )
  })

  it('arma el número del pedido y vincula al proveedor', async () => {
    const d = deps()
    await ejecutarEnvio(
      { tipo: 'pedido', telefono: '011 15 4444-5555', proveedorId: 'p1', texto: 'pedido' },
      'user1',
      d
    )
    expect(d.enviarTexto).toHaveBeenCalledWith('5491144445555', 'pedido')
    expect(d.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ telefono: '5491144445555', origen: 'pedido', proveedorId: 'p1' })
    )
  })

  it('rechaza un teléfono de proveedor que no se reconoce, sin enviar nada', async () => {
    const d = deps()
    const r = await ejecutarEnvio({ tipo: 'pedido', telefono: 'abc', proveedorId: 'p1', texto: 'x' }, 'u', d)
    expect(r.status).toBe(400)
    expect(d.enviarTexto).not.toHaveBeenCalled()
  })

  it('si el gateway falla, guarda el mensaje con error para poder reintentar', async () => {
    const d = deps({ enviarTexto: vi.fn().mockRejectedValue(new Error('caído')) })
    const r = await ejecutarEnvio({ tipo: 'conversacion', conversacionId: 'c1', texto: 'hola' }, 'u', d)
    expect(r.status).toBe(502)
    expect(r.cuerpo).toMatchObject({ ok: false, mensajeId: 'm1' })
    expect(d.registrar).toHaveBeenCalledWith(expect.objectContaining({ estado: 'error', waMessageId: null }))
  })

  it('devuelve 404 si la conversación no existe', async () => {
    const d = deps({ telefonoDeConversacion: vi.fn().mockResolvedValue(null) })
    const r = await ejecutarEnvio({ tipo: 'conversacion', conversacionId: 'x', texto: 'hola' }, 'u', d)
    expect(r.status).toBe(404)
  })

  it('reintenta un mensaje con error y lo marca como enviado', async () => {
    const d = deps()
    const r = await ejecutarEnvio({ tipo: 'reintento', mensajeId: 'm9' }, 'u', d)
    expect(r).toEqual({ status: 200, cuerpo: { ok: true, mensajeId: 'm9' } })
    expect(d.marcarMensaje).toHaveBeenCalledWith('m9', { estado: 'enviado', waMessageId: 'WA1' })
  })

  it('si el reintento vuelve a fallar, devuelve 502 y no cambia el mensaje', async () => {
    const d = deps({ enviarTexto: vi.fn().mockRejectedValue(new Error('caído')) })
    const r = await ejecutarEnvio({ tipo: 'reintento', mensajeId: 'm9' }, 'u', d)
    expect(r.status).toBe(502)
    expect(d.marcarMensaje).not.toHaveBeenCalled()
  })
})
