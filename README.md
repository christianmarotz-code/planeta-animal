# Planeta Animal

Sistema de gestión para veterinaria y petshop: proveedores, compras con lectura de boletas por
foto, stock, ventas, gastos y reportes.

Next.js (App Router) · React · Supabase · Tailwind.

## Empezar

```bash
npm install
cp .env.local.example .env.local   # completar con las claves de Supabase y Anthropic
npm run dev                        # http://localhost:3000
```

## Comandos

| Comando | Para qué |
|---|---|
| `npm run check` | Tipos + lint + tests + build. Correr antes de cada commit. |
| `npm test` | Tests de la lógica. |
| `npm run e2e` | Pruebas de navegador (Playwright). |

## Documentación

- [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md): cómo está organizado, roles, flujo de compras, reglas de seguridad.
- [`docs/PRUEBAS.md`](docs/PRUEBAS.md): qué cubre cada tipo de prueba y sus límites.
- [`AGENTS.md`](AGENTS.md): avisos para agentes de código (esta versión de Next.js tiene cambios respecto de lo conocido).
