import { defineConfig, devices } from '@playwright/test'
import { loadEnvConfig } from '@next/env'

// Lee .env.local para tener la URL y la clave pública de Supabase en las pruebas.
loadEnvConfig(process.cwd())

const PUERTO = 3000

export default defineConfig({
  testDir: './e2e',
  // Un solo worker: las pruebas comparten el servidor de desarrollo y la misma base.
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${PUERTO}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
