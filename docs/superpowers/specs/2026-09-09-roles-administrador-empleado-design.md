# Roles de Usuario (Administrador / Empleado) — Design Spec

**Fecha:** 2026-09-09
**Contexto:** Planeta Animal (veterinaria) hoy tiene un solo tipo de usuario: cualquier persona logueada ve absolutamente todo, incluida información financiera sensible (costos, impuestos de proveedores, gasto total). El cliente quiere dos roles — administrador (Cristián, hoy el único usuario) y empleado — donde el empleado pueda operar el día a día (proveedores, productos, stock) sin ver plata, y donde Cristián pueda dar de alta cuentas nuevas y asignarles un rol desde la propia app.

## Objetivo

- Un rol `administrador` que ve y hace todo lo que la app ya permite hoy.
- Un rol `empleado` que puede operar la parte no financiera del día a día, pero no ve montos de dinero en ningún lado de la app.
- Una pantalla para que el administrador invite gente nueva (creando su cuenta de login) y le asigne un rol, y para cambiar el rol de alguien que ya tiene cuenta.
- Un extra pedido por el cliente: que el empleado pueda ver un historial de qué stock entró/se ajustó y por qué, sin necesitar que el administrador se lo cuente.

## Fuera de alcance

- Cualquier tercer rol o permiso granular más fino que "administrador"/"empleado" — solo estos dos.
- Que el empleado pueda registrar la recepción física de mercadería de forma independiente de la carga de la factura — el stock solo sube hoy por carga de factura (con montos, exclusivo admin) o ajuste manual; dejar que el empleado sume stock "recibido" por su cuenta duplicaría el conteo cuando el admin cargue la factura real de esa misma entrega. Queda anotado como posible feature futura, no parte de esta spec.
- Enforcement de la restricción financiera a nivel de base de datos (RLS por columna). Ver "Decisión de arquitectura" abajo.
- Que un administrador pueda cambiarse el rol a sí mismo (ver Global Constraint de auto-bloqueo).

## Decisión de arquitectura: enforcement en la UI, no en la base de datos

Esta es una herramienta interna para el equipo de la veterinaria, no una app pública con adversarios. La restricción de "el empleado no ve montos" se implementa **ocultando en el cliente** las secciones/campos financieros según `perfiles.rol` — la base de datos sigue permitiendo leer esas tablas a cualquier usuario autenticado, igual que hoy. Es la opción consistente con el resto de la app (todo el patrón existente es "traer y calcular en el cliente") y evita la complejidad de separar tablas/vistas por columna en Postgres, que no se justifica para un puñado de empleados de confianza.

La única pieza de esta feature que SÍ es una barrera de seguridad real (no solo visual) es la creación de cuentas nuevas — por eso esa parte se resuelve con una verificación en el servidor, no en el cliente (ver Parte 2).

## Parte 1 — Modelo de datos: rol de usuario

Migración `supabase/migrations/0007_roles.sql`:

```sql
alter table perfiles add column rol text not null default 'empleado'
  check (rol in ('administrador', 'empleado'));

-- Promueve al único usuario existente del sistema a administrador.
-- Si para cuando corras esto ya hay más de un perfil creado, ajustá el
-- WHERE para apuntar solo a la cuenta correcta antes de ejecutar.
update perfiles set rol = 'administrador';
```

`rol` default `'empleado'` — el más restrictivo — así cualquier alta nueva (incluida la auto-creación al primer login, ya existente en `obtenerOCrearPerfilActual`) arranca sin acceso financiero salvo que un administrador decida lo contrario explícitamente.

`types/database.ts` agrega:
```ts
export type RolPerfil = 'administrador' | 'empleado'
```
y `Perfil.rol: RolPerfil` a la interfaz ya existente. `obtenerOCrearPerfilActual` no necesita cambios de código — como ya hace `select('*')`, `rol` viene incluido automáticamente una vez que la columna exista; el `insert` de auto-creación no menciona `rol`, así que toma el default `'empleado'` de la base.

## Parte 2 — Alta de cuentas y asignación de rol

**Pantalla nueva `app/(app)/usuarios/page.tsx`** (solo administradores): lista de todas las personas con perfil (nombre, email, rol), con un selector de rol por fila (deshabilitado en la fila del propio administrador logueado — no puede cambiarse el rol a sí mismo), y un formulario para invitar a alguien nuevo (email, nombre, rol).

**Por qué se necesita un endpoint de servidor:** crear un login de verdad para otra persona requiere la `service_role key` de Supabase — un secreto que nunca se usó en este proyecto (todo el código actual usa solo la clave pública `anon`) y que **nunca debe llegar al navegador**. Se agrega:

- `lib/supabase/admin.ts` (NUEVO, server-only): crea un cliente Supabase con la `service_role key` (variable de entorno `SUPABASE_SERVICE_ROLE_KEY`, sin prefijo `NEXT_PUBLIC_` — así Next.js nunca la incluye en el bundle del navegador). Este archivo solo se importa desde Route Handlers, nunca desde un componente `'use client'`.
- `app/api/usuarios/route.ts` (NUEVO): Route Handler de Next.js con `GET`, `POST` y `PATCH`. Cada método:
  1. Lee la sesión con el cliente de servidor normal (`lib/supabase/server.ts`, ya existente) para identificar quién llama.
  2. Busca el `perfiles.rol` de esa persona (su propia fila, permitido por la política RLS ya existente de "usuarios ven su propio perfil").
  3. Si no es `administrador`, responde 403 sin hacer nada más. **Esta es la verificación real de seguridad de toda la feature** — a diferencia de las restricciones financieras (que son solo visuales), esta sí bloquea de verdad porque corre en el servidor y no depende de qué le muestre la UI a quien llama.
  4. Recién ahí usa el cliente `service_role` (`lib/supabase/admin.ts`) para la operación pedida:
     - `GET`: lista todos los usuarios de Supabase Auth (`supabaseAdmin.auth.admin.listUsers()`) cruzados con sus filas de `perfiles`, devolviendo `{ id, email, nombre, rol }[]`.
     - `POST` (body `{ email, nombre, rol }`): `supabaseAdmin.auth.admin.inviteUserByEmail(email)` (crea la cuenta y dispara el email de invitación de Supabase con el link para que la persona elija su propia contraseña), y luego `supabaseAdmin.from('perfiles').insert({ id: <id devuelto>, nombre, rol })` — así la cuenta ya queda con el rol correcto desde su primer login, sin depender del alta automática (que le pondría el nombre default del email).
     - `PATCH` (body `{ id, rol }`): rechaza con 400 si `id` es igual al `id` del propio llamante (nadie se cambia el rol a sí mismo); si no, `supabaseAdmin.from('perfiles').update({ rol }).eq('id', id)`.
- `lib/data/usuarios.ts` (NUEVO): wrapper del lado del cliente que llama a esas 3 rutas vía `fetch('/api/usuarios', ...)` — `listarUsuarios()`, `invitarUsuario({ email, nombre, rol })`, `actualizarRolUsuario(id, rol)`.

**Nota operativa:** esto depende de que el envío de emails esté funcionando en el proyecto de Supabase — el servicio de emails incluido de Supabase alcanza para el volumen de invitaciones de una veterinaria (unas pocas por año, no cientos).

## Parte 3 — Qué ve un empleado en cada sección

| Sección | Empleado |
|---|---|
| Dashboard (`/`) | Ve el saludo y "Stock bajo". No ve las 3 tarjetas en $, el gráfico de gasto semanal, ni "Últimas facturas". |
| Proveedores | Ve la lista y puede crear/editar proveedores (nombre, contacto, dirección) — el panel "Impuestos y descuentos de este proveedor" queda oculto. Si crea un proveedor, esos campos quedan en sus valores por defecto de la base (sin impuestos, sin descuento) hasta que un administrador los configure. |
| Productos | Ve la lista y puede crear/editar productos — nunca ve `costo_unitario_actual`. |
| Compras | Ve la lista de facturas sin montos (fecha, proveedor, tipo/número de comprobante, estado) y puede anular una factura. No puede cargar una factura nueva — "Nueva factura" queda exclusivo de administrador. En el detalle de una factura no ve costo neto, costo real, ni el resumen de subtotal/IVA/total. |
| Stock | Ve cantidades, puede hacer ajustes manuales de stock, y ve el historial de movimientos (Parte 4) — nunca ve ningún costo. |
| Reportes | Bloqueado — si entra por URL directa, ve un mensaje "Acceso restringido — contactá a un administrador" en vez del contenido. |
| Usuarios | No aparece en la sidebar y no es accesible — exclusivo de administrador (y protegido de verdad en el servidor, no solo escondido). |

La sidebar (`components/Sidebar.tsx`) deja de mostrar los links a "Reportes" y "Usuarios" cuando `perfil.rol !== 'administrador'`.

## Parte 4 — Historial de movimientos de stock

Sección nueva dentro de la página `app/(app)/stock/page.tsx` (no una página separada), visible para ambos roles por igual — la tabla `movimientos_stock` nunca almacenó ningún monto (solo `producto_id`, `tipo`, `cantidad`, `fecha`, `factura_id`, `motivo`, `usuario_id`), así que no hace falta ninguna restricción ahí.

`lib/data/movimientos.ts` (NUEVO): `listarMovimientosStock(limite = 50): Promise<MovimientoStock[]>` — trae los movimientos más recientes ordenados por fecha descendente. La UI los lista con: fecha, nombre del producto (buscado por `producto_id` contra la lista de productos ya cargada, mismo patrón que usa `compras/[id]/page.tsx` para resolver el nombre del proveedor), tipo (`Entrada por compra` / `Ajuste manual`, traducido desde `entrada_compra`/`ajuste_manual`), cantidad, y motivo.

## Testing

- Ningún archivo de este plan lleva test unitario propio: `lib/data/usuarios.ts` y `lib/data/movimientos.ts` son I/O directo (mismo patrón sin tests que el resto de `lib/data/*.ts`), `app/api/usuarios/route.ts` depende de Supabase Auth real (no se puede simular sin credenciales), y los componentes de página no se testean en este proyecto (patrón ya establecido).
- Verificación manual con el usuario: crear un usuario de prueba con rol empleado, confirmar que no ve ninguna cifra en ningún lado, confirmar que el administrador puede cambiarle el rol y que el propio administrador no puede cambiarse el suyo, y confirmar que el historial de movimientos muestra los movimientos reales sin montos.

## Error handling

- `app/api/usuarios/route.ts`: 401 si no hay sesión, 403 si la sesión no es de un administrador, 400 si el `PATCH` intenta cambiar el rol del propio llamante. Errores de Supabase Auth (email inválido, usuario ya invitado) se propagan como 500 con el mensaje de Supabase, y la UI de `/usuarios` los muestra con el mismo patrón de error ya estandarizado en los formularios de la app.
- Páginas que ocultan contenido financiero por rol no necesitan manejo de error nuevo — es una condición simple (`perfil?.rol === 'administrador'`) sobre datos que ya se cargan hoy.
