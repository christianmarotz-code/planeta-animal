import { expect, test } from '@playwright/test'

// Pruebas sin credenciales: no escriben nada en la base.

const RUTAS_PROTEGIDAS = ['/', '/productos', '/stock', '/compras', '/ventas', '/proveedores', '/usuarios']

test.describe('login', () => {
  test('muestra el formulario', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('rechaza una clave incorrecta con un mensaje claro', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill('no-existe@ejemplo.invalid')
    await page.locator('input[type="password"]').fill('clave-incorrecta-123')
    await page.locator('button[type="submit"]').click()
    await expect(page.getByText('Email o contraseña incorrectos.')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('sin iniciar sesión', () => {
  for (const ruta of RUTAS_PROTEGIDAS) {
    test(`${ruta} redirige al login`, async ({ page }) => {
      await page.goto(ruta)
      await expect(page).toHaveURL(/\/login/)
    })
  }

  test('las APIs de administración no responden', async ({ request }) => {
    for (const ruta of ['/api/usuarios', '/api/boletas/extraer', '/api/comparador/leer-pdf']) {
      const res = await request.get(ruta, { maxRedirects: 0 })
      expect([307, 308, 401, 403, 405], `${ruta} respondió ${res.status()}`).toContain(res.status())
    }
  })
})

// Regresión de la migración 0028: con la clave pública (la que viaja en el navegador)
// ninguna función de la base debe poder ejecutarse sin sesión.
const FUNCIONES: Record<string, Record<string, unknown>> = {
  _aplicar_items_factura: { p_factura_id: crypto.randomUUID(), p_items: [], p_motivo: 'e2e' },
  _recalcular_stats_proveedor: { p_proveedor_id: crypto.randomUUID() },
  _revertir_stock_factura: { p_factura_id: crypto.randomUUID(), p_motivo: 'e2e' },
  ajustar_stock_manual: { p_producto_id: crypto.randomUUID(), p_cantidad: 0, p_motivo: 'e2e' },
  anular_factura_compra: { p_factura_id: crypto.randomUUID() },
  anular_venta: { p_venta_id: crypto.randomUUID() },
  cambiar_pronto_pago_factura: { p_factura_id: crypto.randomUUID(), p_descuento: 0 },
  confirmar_entrada_stock: { p_entrada_id: crypto.randomUUID(), p_cantidad_recibida: 0, p_nota: 'e2e' },
  editar_factura_compra: { p_factura_id: crypto.randomUUID(), payload: {} },
  registrar_factura_compra: { payload: {} },
  registrar_venta: { payload: {} },
}

test.describe('funciones de la base con la clave pública', () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  test.skip(!url || !clave, 'Faltan las variables de Supabase en .env.local')

  for (const [nombre, args] of Object.entries(FUNCIONES)) {
    test(`${nombre} está bloqueada para anon`, async ({ request }) => {
      const res = await request.post(`${url}/rest/v1/rpc/${nombre}`, {
        headers: { apikey: clave!, Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
        data: args,
      })
      const cuerpo = await res.text()
      expect([401, 403], `${nombre} respondió ${res.status()}: ${cuerpo}`).toContain(res.status())
    })
  }
})
