// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))

import { requerirSesion } from './requerirSesion'

describe('requerirSesion', () => {
  beforeEach(() => getUser.mockReset())

  it('rechaza con 401 si no hay sesión', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const resultado = await requerirSesion()
    expect(resultado.error?.status).toBe(401)
    expect(resultado.user).toBeUndefined()
  })

  it('devuelve el usuario si hay sesión, sin mirar el rol', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const resultado = await requerirSesion()
    expect(resultado.error).toBeUndefined()
    expect(resultado.user).toEqual({ id: 'u1' })
  })
})
