import { describe, it, expect, vi } from 'vitest'
import { procesarWebhook, secretoValido } from './webhook'
import type { ResultadoRegistro } from './registro'

const resultado: ResultadoRegistro = {
  conversacionId: 'c1',
  mensajeId: 'm1',
  esNuevo: true,
  primeraVez: true,
  proveedorId: null,
  clienteId: null,
}

const aviso = (fromMe: boolean) => ({
  event: 'messages.upsert',
  data: {
    key: { remoteJid: '5491112345678@s.whatsapp.net', fromMe, id: 'WA1' },
    pushName: 'Ana',
    message: { conversation: 'Hola' },
  },
})

describe('secretoValido', () => {
  const secreto = 'a'.repeat(32)
  it('acepta solo el secreto exacto', () => {
    expect(secretoValido(secreto, secreto)).toBe(true)
    expect(secretoValido('b'.repeat(32), secreto)).toBe(false)
    expect(secretoValido('corto', secreto)).toBe(false)
  })
  it('rechaza todo si el secreto configurado falta o es débil', () => {
    expect(secretoValido('x', undefined)).toBe(false)
    expect(secretoValido('corto', 'corto')).toBe(false)
  })
})

describe('procesarWebhook', () => {
  it('registra un mensaje entrante con el teléfono normalizado', async () => {
    const registrar = vi.fn().mockResolvedValue(resultado)
    const r = await procesarWebhook(aviso(false), registrar)
    expect(registrar).toHaveBeenCalledWith({
      telefono: '5491112345678',
      clave: '12345678',
      nombre: 'Ana',
      direccion: 'entrante',
      texto: 'Hola',
      origen: 'entrante',
      estado: 'enviado',
      waMessageId: 'WA1',
      enviadoPor: null,
      reglaTipo: null,
      proveedorId: null,
    })
    expect(r).toEqual({ resultado, telefono: '5491112345678', clave: '12345678', propio: false })
  })

  it('registra lo escrito desde el celular como saliente manual', async () => {
    const registrar = vi.fn().mockResolvedValue({ ...resultado, primeraVez: false })
    const r = await procesarWebhook(aviso(true), registrar)
    expect(registrar).toHaveBeenCalledWith(
      expect.objectContaining({ direccion: 'saliente', origen: 'manual', nombre: null })
    )
    expect(r?.propio).toBe(true)
  })

  it('no registra lo que se ignora', async () => {
    const registrar = vi.fn()
    expect(await procesarWebhook({ event: 'connection.update', data: {} }, registrar)).toBeNull()
    expect(registrar).not.toHaveBeenCalled()
  })
})
