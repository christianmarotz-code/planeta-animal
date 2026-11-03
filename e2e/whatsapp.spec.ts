import { expect, test } from '@playwright/test'

// Sin credenciales y sin escribir nada: el webhook rechaza lo que no trae el secreto
// y todo lo demás exige sesión.
test.describe('WhatsApp sin sesión', () => {
  test('el webhook rechaza un secreto incorrecto sin mandar al login', async ({ request }) => {
    const res = await request.post('/api/whatsapp/webhook/un-secreto-incorrecto-que-no-existe', {
      data: {},
      maxRedirects: 0,
    })
    expect(res.status()).toBe(401)
  })

  test('enviar no responde sin sesión', async ({ request }) => {
    const res = await request.post('/api/whatsapp/enviar', { data: {}, maxRedirects: 0 })
    expect([307, 308, 401]).toContain(res.status())
  })

  test('el estado de la conexión no responde sin sesión', async ({ request }) => {
    const res = await request.get('/api/whatsapp/conexion', { maxRedirects: 0 })
    expect([307, 308, 401]).toContain(res.status())
  })

  test('la pantalla /whatsapp redirige al login', async ({ page }) => {
    await page.goto('/whatsapp')
    await expect(page).toHaveURL(/\/login/)
  })
})
