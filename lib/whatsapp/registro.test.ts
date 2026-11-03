import { describe, it, expect, vi } from 'vitest'
import { registrarMensaje, type RegistroMensaje } from './registro'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

const mensaje: RegistroMensaje = {
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
}

describe('registrarMensaje', () => {
  it('llama a la función SQL con los parámetros p_* y traduce la fila', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          conversacion_id: 'c1',
          mensaje_id: 'm1',
          es_nuevo: true,
          primera_vez: true,
          vinculo_proveedor_id: null,
          vinculo_cliente_id: 'cli1',
        },
      ],
      error: null,
    })
    const r = await registrarMensaje({ rpc } as unknown as Admin, mensaje)
    expect(rpc).toHaveBeenCalledWith('whatsapp_registrar_mensaje', {
      p_telefono: '5491112345678',
      p_clave: '12345678',
      p_nombre: 'Ana',
      p_direccion: 'entrante',
      p_texto: 'Hola',
      p_origen: 'entrante',
      p_estado: 'enviado',
      p_wa_message_id: 'WA1',
      p_enviado_por: null,
      p_regla_tipo: null,
      p_proveedor_id: null,
    })
    expect(r).toEqual({
      conversacionId: 'c1',
      mensajeId: 'm1',
      esNuevo: true,
      primeraVez: true,
      proveedorId: null,
      clienteId: 'cli1',
    })
  })

  it('lanza si la base devuelve error', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(registrarMensaje({ rpc } as unknown as Admin, mensaje)).rejects.toThrow()
  })
})
