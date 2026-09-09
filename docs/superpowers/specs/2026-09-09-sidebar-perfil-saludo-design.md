# Sidebar, Perfil de Usuario y Saludo Personalizado — Design Spec

**Fecha:** 2026-09-09
**Contexto:** Primera tanda de mejoras estéticas/UX para Planeta Animal, después de terminar la analítica de gastos por período. El usuario pidió 3 cosas relacionadas: mover la navegación superior a una sidebar izquierda, un sistema de perfil de usuario con foto, y un saludo personalizado en el dashboard usando el nombre del perfil. El usuario planea seguir iterando con más ideas estéticas después de esta tanda.

## Objetivo

Hoy la navegación es una píldora horizontal flotante arriba de la pantalla ([app/(app)/layout.tsx](../../../app/(app)/layout.tsx)), y no existe ningún concepto de "perfil" — solo el email de login vía Supabase Auth. El cliente quiere una navegación lateral más prolija, y que cada persona logueada tenga un nombre visible y una foto propios, usados para personalizar el dashboard ("Bienvenido, Cristián").

## Fuera de alcance

- Panel de administración de usuarios (crear/editar perfiles de otras personas) — no existe todavía en Fase 1; cada usuario gestiona solo su propio perfil.
- Cambio de email o contraseña desde `/perfil`.
- Recorte/edición de imagen antes de subir (crop, resize) — se sube el archivo tal cual, el navegador lo escala vía CSS.
- Roles de usuario (admin/user) — mencionados en el alcance original del proyecto pero no parte de esta tanda.
- Caché o estado global compartido para el perfil — cada componente que lo necesita lo pide por su cuenta, mismo patrón que el resto de la app.

## Parte 1 — Sidebar de navegación

### Arquitectura

`app/(app)/layout.tsx` sigue siendo un Server Component sin cambios en su lógica de auth (verifica sesión con `supabase.auth.getUser()`, redirige a `/login` si no hay usuario). Se reemplaza el `<nav>` horizontal actual por un nuevo componente cliente `components/Sidebar.tsx`, que recibe `children` desde el layout y se encarga de toda la presentación de navegación.

### Desktop (`md:` y superior)

Franja vertical fija a la izquierda, ancho `w-60` (240px), altura completa (`h-screen`, `sticky top-0`). Contenido, de arriba a abajo:
1. Logo (reutiliza `components/Logo.tsx` ya existente).
2. Los 6 links de navegación (`Inicio`, `Proveedores`, `Productos`, `Compras`, `Stock`, `Reportes`) apilados verticalmente, cada uno un botón de ancho completo con icono de estado activo: el link cuya ruta coincide con `usePathname()` se resalta con fondo `bg-white/10` (o el equivalente en el token de acento) y texto blanco pleno; los demás quedan en `text-white/75` como hoy.
3. Al fondo (empujado con `mt-auto` en un contenedor flex-column): avatar (`sm`) + nombre del usuario, como link a `/perfil` ("Mi perfil"), y debajo el botón "Cerrar sesión" (mismo `<form action="/api/auth/signout">` que ya existe).

El contenido principal (`<main>`) se desplaza con `md:ml-60` para no quedar debajo de la sidebar.

### Mobile (debajo de `md:`)

La sidebar de ancho completo se oculta (`hidden md:flex`). En su lugar, una barra superior angosta y fija (`sticky top-0`) muestra el logo y un botón hamburguesa a la derecha. Al tocarlo:
- Se despliega la sidebar como panel superpuesto (`fixed inset-y-0 left-0`) deslizando desde la izquierda (`translate-x-0` desde `-translate-x-full`), con una curva `cubic-bezier` ya definida en el sistema de diseño (`--ease`, `--dur-*`).
- Aparece un fondo oscurecido con `backdrop-blur` detrás del panel, que al tocarlo cierra la sidebar.
- El botón hamburguesa se transforma en una "X" mientras el panel está abierto (mismo patrón de rotación de líneas que ya está descrito en las directrices de diseño del proyecto).

### Estado

El toggle mobile (abierto/cerrado) es estado local de React dentro de `Sidebar.tsx` (`useState`), sin necesidad de nada más. El resaltado del link activo usa `usePathname()` de `next/navigation`.

## Parte 2 — Perfil de usuario

### Modelo de datos

Tabla nueva `perfiles` (migración `supabase/migrations/0006_perfiles.sql`):

```sql
create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table perfiles enable row level security;

create policy "usuarios ven su propio perfil"
  on perfiles for select
  using (auth.uid() = id);

create policy "usuarios crean su propio perfil"
  on perfiles for insert
  with check (auth.uid() = id);

create policy "usuarios actualizan su propio perfil"
  on perfiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
```

Sin política de `delete` — no hay caso de uso para borrar un perfil en esta tanda.

### Alta automática

`lib/data/perfiles.ts` expone `obtenerOCrearPerfilActual(): Promise<Perfil>`:
1. Obtiene el usuario autenticado (`supabase.auth.getUser()`, cliente browser — mismo patrón que el resto de `lib/data/*.ts`).
2. Busca su fila en `perfiles` por `id`.
3. Si no existe, la crea con `nombre` = la parte del email antes de `@` (`user.email?.split('@')[0] ?? 'Usuario'`) y `avatar_url = null`.
4. Si el insert falla por violación de PK (carrera entre dos pestañas creando el perfil al mismo tiempo), vuelve a leer la fila — ya la creó la otra pestaña — y la devuelve.

Esta es la única función que "trae o crea" el perfil; tanto `Sidebar` como el dashboard la llaman de forma independiente, cada uno en su propio `useEffect`.

`lib/data/perfiles.ts` expone además:
- `actualizarNombrePerfil(nombre: string): Promise<void>` — actualiza solo el campo `nombre`.
- `subirAvatar(file: File): Promise<string>` — sube el archivo al bucket `avatars` en la ruta `<user_id>/avatar.<ext>` (extensión tomada de `file.name`, `upsert: true` para sobrescribir sin acumular archivos viejos), obtiene la URL pública, actualiza `avatar_url` en `perfiles`, y devuelve esa URL.

### Storage

Bucket `avatars`, público en lectura (URLs públicas, sin necesidad de URLs firmadas — toda la app ya requiere login para llegar a verlas). Políticas en la misma migración:

```sql
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true);

create policy "usuarios suben su propio avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "usuarios actualizan su propio avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "cualquiera puede ver los avatares"
  on storage.objects for select
  using (bucket_id = 'avatars');
```

### Tipos

`types/database.ts` agrega:
```ts
export interface Perfil {
  id: string
  nombre: string
  avatar_url: string | null
  created_at: string
}
```

### UI — `/perfil`

Página nueva `app/(app)/perfil/page.tsx`, mismo patrón visual que `ProveedorForm`/`ProductoForm` (formulario en `shell`/`core`, inputs con `INPUT_CLASS`):
- Input de texto para `nombre` (requerido, no vacío).
- Selector de archivo de imagen (`accept="image/*"`), con preview inmediato (usando `URL.createObjectURL` antes de subir) y el `Avatar` actual como estado inicial del preview.
- Validación simple: rechazar archivos de más de 3MB con un mensaje de error, sin subir nada.
- Botón "Guardar": si cambió el nombre, llama `actualizarNombrePerfil`; si se seleccionó una foto nueva, llama `subirAvatar`. Ambas llamadas pueden ejecutarse en la misma acción de guardado.
- Estado de carga/error consistente con el resto de los formularios de la app (`saving`, mensaje de error en rojo si falla).

## Parte 3 — Avatar y saludo del dashboard

### `components/Avatar.tsx`

```ts
interface AvatarProps {
  nombre: string
  avatarUrl: string | null
  size?: 'sm' | 'lg'
}
```
- Si `avatarUrl` está presente: `<img>` circular (`rounded-full`, `object-cover`) del tamaño correspondiente (`sm` = 32px, `lg` = 96px).
- Si no: círculo del mismo tamaño con fondo `bg-accent` y la primera letra de `nombre` (mayúscula) centrada en blanco.

Usado con `size="sm"` en `Sidebar`, y `size="lg"` en `/perfil` junto al selector de archivo.

### Saludo personalizado

En `app/(app)/page.tsx`, se agrega `obtenerOCrearPerfilActual()` al mismo `Promise.all` del `useEffect` que ya carga facturas/proveedores/productos. El título del panel general cambia de:
```tsx
<h1 className="mt-1 text-[27px] text-ink">Inicio</h1>
```
a:
```tsx
<h1 className="mt-1 text-[27px] text-ink">Bienvenido, {perfil?.nombre ?? '...'}</h1>
```
Mientras el perfil no cargó (`perfil` es `null` en el estado inicial), se muestra `Bienvenido, ...` como fallback breve — no hay salto de layout brusco porque el título ya ocupa su lugar desde el primer render (el `loading` general de la página ya cubre este período con un `Cargando…`, igual que hoy).

## Testing

- `lib/data/perfiles.ts` no lleva tests unitarios propios porque son funciones de I/O directo contra Supabase (mismo patrón sin tests que `lib/data/productos.ts`, `lib/data/proveedores.ts`, `lib/data/facturas.ts` — ninguna tiene tests hoy; solo los módulos de cálculo puro en `lib/calc/` y `lib/data/reportes.ts` los tienen).
- `components/Avatar.tsx` es un componente de presentación pura (sin fetch, sin estado) — candidato razonable para no tener test propio, siguiendo el patrón ya establecido de no testear componentes React en este proyecto.
- Verificación manual en navegador (con el usuario, como en features anteriores): sidebar responsive en desktop y mobile, alta automática de perfil al loguearse, subida de foto, actualización de nombre, saludo en el dashboard reflejando el nombre guardado.

## Error handling

- `obtenerOCrearPerfilActual`: si `supabase.auth.getUser()` no devuelve usuario (no debería pasar dentro del layout autenticado, pero por robustez), lanza error — consistente con el resto de `lib/data/*.ts`, que también lanzan en errores de Supabase sin manejo especial.
- `subirAvatar`: rechaza client-side archivos mayores a 3MB antes de intentar la subida; errores de Supabase Storage (red, cuota) se propagan como excepción y la UI de `/perfil` los muestra como el mensaje de error ya estandarizado en los formularios de la app.
- Carrera de alta de perfil: manejada explícitamente en `obtenerOCrearPerfilActual` (ver Parte 2) — no es un caso de error de cara al usuario.
