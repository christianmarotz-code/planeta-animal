import { describe, it, expect, vi } from 'vitest'
import {
  elegirRegla,
  estaAbierto,
  pausaAleatoriaMs,
  responderAutomatico,
  type DepsAutomaticos,
} from './automaticos'
import type { ReglaWhatsapp } from '@/types/database'

const saludo: ReglaWhatsapp = { tipo: 'saludo_inicial', activa: true, texto: 'Hola!', abre: null, cierra: null, dias: [1, 2, 3, 4, 5, 6] }
const fuera: ReglaWhatsapp = { tipo: 'fuera_de_horario', activa: true, texto: 'Cerrado', abre: '09:00', cierra: '19:00', dias: [1, 2, 3, 4, 5, 6] }

// Buenos Aires es UTC-3 todo el año. 2026-11-03 es martes.
const martes12h = new Date('2026-11-03T15:00:00Z')
const martes22h = new Date('2026-11-04T01:00:00Z')
const domingo12h = new Date('2026-11-08T15:00:00Z')

const base = { interruptor: true, primeraVez: false, esProveedor: false, ultimoEnvio: {} }

describe('estaAbierto', () => {
  it('respeta horario y días en hora argentina', () => {
    expect(estaAbierto(fuera, martes12h)).toBe(true)
    expect(estaAbierto(fuera, martes22h)).toBe(false)
    expect(estaAbierto(fuera, domingo12h)).toBe(false)
  })
  it('sin horario cargado nunca está "cerrado"', () => {
    expect(estaAbierto({ ...fuera, abre: null, cierra: null }, martes22h)).toBe(true)
  })
})

describe('elegirRegla', () => {
  it('fuera de horario responde aunque no sea la primera vez', () => {
    expect(elegirRegla([saludo, fuera], { ...base, ahora: martes22h })?.tipo).toBe('fuera_de_horario')
  })
  it('si es la primera vez y estamos fuera de horario, manda solo fuera de horario', () => {
    expect(elegirRegla([saludo, fuera], { ...base, ahora: martes22h, primeraVez: true })?.tipo).toBe('fuera_de_horario')
  })
  it('en horario, saluda solo la primera vez', () => {
    expect(elegirRegla([saludo, fuera], { ...base, ahora: martes12h, primeraVez: true })?.tipo).toBe('saludo_inicial')
    expect(elegirRegla([saludo, fuera], { ...base, ahora: martes12h })).toBeNull()
  })
  it('no responde con el interruptor apagado ni a proveedores', () => {
    expect(elegirRegla([saludo, fuera], { ...base, ahora: martes22h, interruptor: false })).toBeNull()
    expect(elegirRegla([saludo, fuera], { ...base, ahora: martes22h, esProveedor: true })).toBeNull()
  })
  it('ignora reglas inactivas', () => {
    expect(elegirRegla([{ ...fuera, activa: false }], { ...base, ahora: martes22h })).toBeNull()
  })
  it('no repite la misma regla dentro de las 24 h', () => {
    const hace2h = new Date(martes22h.getTime() - 2 * 3600_000)
    const hace25h = new Date(martes22h.getTime() - 25 * 3600_000)
    expect(elegirRegla([fuera], { ...base, ahora: martes22h, ultimoEnvio: { fuera_de_horario: hace2h } })).toBeNull()
    expect(elegirRegla([fuera], { ...base, ahora: martes22h, ultimoEnvio: { fuera_de_horario: hace25h } })?.tipo).toBe('fuera_de_horario')
  })
})

describe('pausaAleatoriaMs', () => {
  it('queda entre 2 y 6 segundos', () => {
    expect(pausaAleatoriaMs(() => 0)).toBe(2000)
    expect(pausaAleatoriaMs(() => 0.999999)).toBe(6000)
  })
})

function deps(sobre: Partial<DepsAutomaticos> = {}): DepsAutomaticos {
  return {
    cargarConfig: vi.fn().mockResolvedValue({ interruptor: true, reglas: [saludo, fuera] }),
    ultimosEnvios: vi.fn().mockResolvedValue({}),
    enviarTexto: vi.fn().mockResolvedValue({ waMessageId: 'WA9' }),
    registrar: vi.fn().mockResolvedValue({
      conversacionId: 'c1', mensajeId: 'm1', esNuevo: true, primeraVez: false, proveedorId: null, clienteId: null,
    }),
    marcarMensaje: vi.fn().mockResolvedValue(undefined),
    dormir: vi.fn().mockResolvedValue(undefined),
    ahora: () => martes22h,
    ...sobre,
  }
}
const entrada = { telefono: '5491112345678', clave: '12345678', conversacionId: 'c1', primeraVez: true, esProveedor: false }

describe('responderAutomatico', () => {
  it('registra primero, espera, envía y marca como enviado', async () => {
    const d = deps()
    const r = await responderAutomatico(entrada, d)
    expect(r).toBe('fuera_de_horario')
    expect(d.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ origen: 'automatico', estado: 'pendiente', reglaTipo: 'fuera_de_horario', texto: 'Cerrado' })
    )
    expect(d.dormir).toHaveBeenCalled()
    expect(d.enviarTexto).toHaveBeenCalledWith('5491112345678', 'Cerrado')
    expect(d.marcarMensaje).toHaveBeenCalledWith('m1', { estado: 'enviado', waMessageId: 'WA9' })
  })
  it('no hace nada si ninguna regla corresponde', async () => {
    const d = deps({ ahora: () => martes12h })
    expect(await responderAutomatico({ ...entrada, primeraVez: false }, d)).toBeNull()
    expect(d.registrar).not.toHaveBeenCalled()
    expect(d.enviarTexto).not.toHaveBeenCalled()
  })
  it('si el gateway falla, marca el mensaje con error y no lanza', async () => {
    const d = deps({ enviarTexto: vi.fn().mockRejectedValue(new Error('caído')) })
    expect(await responderAutomatico(entrada, d)).toBeNull()
    expect(d.marcarMensaje).toHaveBeenCalledWith('m1', { estado: 'error', waMessageId: null })
  })
})
