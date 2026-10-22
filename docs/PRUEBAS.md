# Pruebas

| Comando | Qué hace | Toca la base |
|---|---|---|
| `npm run check` | tipos + lint + tests + build. Correrlo antes de cada commit. | No |
| `npm test` | Tests de la lógica (cálculos, stock, errores). | No |
| `npm run e2e` | Pruebas de navegador con Playwright (levanta `npm run dev` si no está corriendo). | Solo lectura |

## Qué cubre `npm run e2e`

**Sin sesión** (`e2e/sin-sesion.spec.ts`, no necesita nada):
- El login se muestra y rechaza una clave incorrecta con un mensaje claro.
- Las pantallas protegidas redirigen al login.
- Las APIs de administración no responden sin sesión.
- Las 11 funciones de la base están bloqueadas para la clave pública (regresión de la migración 0028).

**Con sesión, solo lectura** (`e2e/con-sesion.spec.ts`): inicia sesión y recorre las pantallas
principales buscando errores de JavaScript. Se saltea sola si faltan las credenciales.

Para activarlas, crear un usuario de prueba **sin rol de administrador** en Supabase
(Authentication → Users) y definir en `.env.local` (no se sube al repositorio):

```
E2E_EMAIL=...
E2E_PASSWORD=...
```

## Por qué no hay pruebas que creen datos

No hay una base de pruebas: todo corre contra la base real. Por eso las pruebas con sesión
no crean ventas, compras ni ajustes. Para probar escrituras habría que tener una segunda
base (un proyecto gratis de Supabase o Supabase local con Docker).
