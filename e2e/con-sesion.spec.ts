import { expect, test, type Page } from '@playwright/test'

// Solo lectura: inicia sesión y recorre las pantallas sin crear ni modificar nada.
// Necesita un usuario de prueba (ver docs/PRUEBAS.md). Sin E2E_EMAIL/E2E_PASSWORD se saltea.
const email = process.env.E2E_EMAIL
const clave = process.env.E2E_PASSWORD

test.describe('con sesión (solo lectura)', () => {
  test.skip(!email || !clave, 'Definí E2E_EMAIL y E2E_PASSWORD para correr estas pruebas')

  async function iniciarSesion(page: Page) {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(email!)
    await page.locator('input[type="password"]').fill(clave!)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL((u) => !u.pathname.startsWith('/login'))
  }

  test('inicia sesión y sale del login', async ({ page }) => {
    await iniciarSesion(page)
    await expect(page).not.toHaveURL(/\/login/)
  })

  for (const ruta of ['/', '/productos', '/stock', '/compras', '/ventas', '/proveedores', '/gastos', '/reportes']) {
    test(`${ruta} carga sin errores`, async ({ page }) => {
      const errores: string[] = []
      page.on('pageerror', (e) => errores.push(e.message))
      await iniciarSesion(page)
      const res = await page.goto(ruta)
      expect(res?.status()).toBeLessThan(400)
      await page.waitForLoadState('networkidle')
      await expect(page.locator('body')).toBeVisible()
      expect(errores, `Errores de JavaScript en ${ruta}`).toEqual([])
    })
  }
})
