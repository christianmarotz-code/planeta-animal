# Sidebar, Perfil de Usuario y Saludo Personalizado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la navegación horizontal de Planeta Animal por una sidebar izquierda responsive, agregar un sistema de perfil de usuario (nombre + foto) con alta automática, y mostrar un saludo personalizado en el dashboard.

**Architecture:** Una tabla nueva `perfiles` (RLS por usuario) + un bucket de Storage `avatars` sostienen los datos; `lib/data/perfiles.ts` es la única puerta de entrada a esos datos desde el cliente (mismo patrón que `lib/data/productos.ts` et al.); `components/Sidebar.tsx` reemplaza el `<nav>` actual y `components/Avatar.tsx` es un componente de presentación puro reutilizado en la sidebar y en la nueva página `/perfil`.

**Tech Stack:** Next.js 16 (App Router, TypeScript), Supabase (Postgres, Auth, Storage), Tailwind CSS v4 (sistema de diseño "Bento" ya aplicado).

**Spec:** `docs/superpowers/specs/2026-09-09-sidebar-perfil-saludo-design.md`

## Global Constraints

- Cada usuario gestiona únicamente su propio perfil — sin panel de administración de usuarios (no existe todavía).
- `/perfil` no permite cambiar email ni contraseña — solo nombre y foto.
- Sin crop/resize de imagen — el archivo se sube tal cual, el navegador lo escala vía CSS.
- Sin caché ni estado global de perfil — cada componente que lo necesita lo pide por su cuenta (mismo patrón que el resto de la app, donde cada página hace sus propios fetches).
- Tamaño máximo de archivo de avatar: 3MB, validado en el cliente antes de subir — si supera el límite, error visible, sin intentar la subida.
- Bucket de Storage `avatars`, público en lectura; cada archivo va a `<user_id>/avatar.<ext>`, subido con `upsert: true` (sobrescribe, no acumula archivos viejos).
- La migración SQL nunca la corre el asistente/implementer contra la base viva — el usuario la ejecuta manualmente en el SQL Editor de Supabase, igual que en toda migración anterior de este proyecto.
- Sidebar desktop: ancho fijo `w-60` (240px). Mobile: se oculta y aparece detrás de un botón hamburguesa como panel deslizante con backdrop.
- Avatar sin foto: círculo con fondo `bg-accent` y la primera letra del nombre en blanco, mayúscula.
- Reutilizar tokens/clases ya existentes: `.shell`/`.core`, `.pill-btn` (y `.ghost`), `bg-accent-ink`, y la curva de animación `cubic-bezier(0.32, 0.72, 0, 1)` (definida como `--ease` en `app/globals.css`) para las transiciones de la sidebar mobile.
- Ningún componente de este plan lleva tests automatizados — `lib/data/perfiles.ts` es I/O directo contra Supabase (mismo patrón sin tests que el resto de `lib/data/*.ts` salvo `reportes.ts`), y los componentes React de este proyecto no se testean (patrón ya establecido). La verificación es manual, en el navegador, con el usuario.

---

## Estado actual de los archivos relevantes

**`app/(app)/layout.tsx`** (52 líneas) — Server Component: verifica auth con `supabase.auth.getUser()`, redirige a `/login` si no hay usuario, y renderiza un `<nav>` horizontal con `LINKS` (Inicio, Proveedores, Productos, Compras, Stock, Reportes) más un botón "Cerrar sesión". Esta lógica de auth NO cambia — solo se reemplaza el `<nav>` por el componente `Sidebar`.

**`app/(app)/page.tsx`** (190 líneas) — dashboard, `'use client'`. Carga `facturas`/`proveedores`/`productos` en un único `useEffect` con `Promise.all`, y el título hoy dice `<h1 className="mt-1 text-[27px] text-ink">Inicio</h1>` (línea 89).

**`components/Logo.tsx`** — ya existe, exporta `Logo` (imagen completa) y `PawIcon`. Se reutiliza tal cual en `Sidebar`.

**`lib/supabase/client.ts`** — `createClient()` crea un cliente browser de Supabase tipado con `Database` (de `types/database.ts`). Todas las funciones de `lib/data/*.ts` lo usan así, sin excepción.

**`types/database.ts`** (102 líneas) — define una interfaz por tabla (`Proveedor`, `Producto`, `FacturaCompra`, etc.) y un `Database.public.Tables` que las mapea para tipar el cliente Supabase. No existe ningún concepto de perfil hoy.

**Patrón de formularios ya establecido** (ej. `app/(app)/proveedores/ProveedorForm.tsx`): `INPUT_CLASS` constante compartida, estado `saving`/`error`, botón `pill-btn` con label que cambia a "Guardando…", mensaje de error en `text-negative`.

---

### Task 1: Tabla `perfiles`, tipos y capa de datos

**Files:**
- Create: `supabase/migrations/0006_perfiles.sql`
- Modify: `types/database.ts` (agregar interfaz `Perfil` y la entrada `perfiles` en `Database.public.Tables`)
- Create: `lib/data/perfiles.ts`

**Interfaces:**
- Consumes: `createClient` de `@/lib/supabase/client` (ya existe).
- Produces: tipo `Perfil` (`@/types/database`); funciones `obtenerOCrearPerfilActual(): Promise<Perfil>`, `actualizarNombrePerfil(nombre: string): Promise<void>`, `subirAvatar(file: File): Promise<string>` desde `@/lib/data/perfiles`. Tasks 3, 4 y 5 las consumen.

- [ ] **Step 1: Crear la migración SQL**

Crear `supabase/migrations/0006_perfiles.sql` con este contenido exacto:

```sql
-- Perfiles de usuario: nombre visible y foto, para personalizar la UI
-- (sidebar, saludo del dashboard). Cada usuario gestiona únicamente su
-- propio perfil — no hay panel de administración de usuarios todavía.

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

-- Storage: bucket público (en lectura) para fotos de perfil. Cada usuario
-- solo puede escribir dentro de su propia carpeta <user_id>/.
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

No hay manera de probar este SQL sin credenciales de la base de datos viva — no lo ejecutes. El controlador se lo va a pasar al usuario para que lo corra en el SQL Editor de Supabase después de que este task se revise.

- [ ] **Step 2: Agregar el tipo `Perfil` a `types/database.ts`**

En `types/database.ts`, agregar esta interfaz inmediatamente después del cierre de `MovimientoStock` (línea 78, antes de `export interface Database {` en la línea 80):

```ts
export interface Perfil {
  id: string
  nombre: string
  avatar_url: string | null
  created_at: string
}
```

- [ ] **Step 3: Registrar `perfiles` en `Database.public.Tables`**

En el mismo archivo, dentro de `Database.public.Tables`, agregar esta entrada inmediatamente después de la entrada `movimientos_stock` (que termina en la línea 99, justo antes del `}` que cierra `Tables`):

```ts
      perfiles: { Row: Perfil; Insert: Partial<Perfil>; Update: Partial<Perfil> }
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores. (Fallará en este punto solo si el paso anterior tiene un typo — no hay código todavía que use `Perfil`.)

- [ ] **Step 5: Crear `lib/data/perfiles.ts`**

```ts
import { createClient } from '@/lib/supabase/client'
import type { Perfil } from '@/types/database'

export async function obtenerOCrearPerfilActual(): Promise<Perfil> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { data: existente } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()
  if (existente) return existente as Perfil

  const nombreDefault = user.email?.split('@')[0] ?? 'Usuario'
  const { data: creado, error } = await supabase
    .from('perfiles')
    .insert({ id: user.id, nombre: nombreDefault, avatar_url: null } as never)
    .select()
    .single()

  if (error) {
    // Carrera: otra pestaña ya creó el perfil entre el select y el insert.
    const { data: retry, error: errorRetry } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', user.id)
      .single()
    if (errorRetry) throw errorRetry
    return retry as Perfil
  }
  return creado as Perfil
}

export async function actualizarNombrePerfil(nombre: string): Promise<void> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { error } = await supabase.from('perfiles').update({ nombre } as never).eq('id', user.id)
  if (error) throw error
}

export async function subirAvatar(file: File): Promise<string> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const extension = file.name.split('.').pop() ?? 'jpg'
  const ruta = `${user.id}/avatar.${extension}`

  const { error: errorSubida } = await supabase.storage
    .from('avatars')
    .upload(ruta, file, { upsert: true })
  if (errorSubida) throw errorSubida

  const {
    data: { publicUrl },
  } = supabase.storage.from('avatars').getPublicUrl(ruta)

  const { error: errorUpdate } = await supabase
    .from('perfiles')
    .update({ avatar_url: publicUrl } as never)
    .eq('id', user.id)
  if (errorUpdate) throw errorUpdate

  return publicUrl
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Correr la suite de tests existente**

Run: `npx vitest run`
Expected: PASS — este task no agrega ni modifica tests; todos los tests existentes (35 en este momento) siguen en verde. `lib/data/perfiles.ts` no lleva test propio (ver Global Constraints).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0006_perfiles.sql types/database.ts lib/data/perfiles.ts
git commit -m "feat: agregar tabla de perfiles, storage de avatares y capa de datos"
```

---

### Task 2: Componente `Avatar`

**Files:**
- Create: `components/Avatar.tsx`

**Interfaces:**
- Consumes: nada nuevo — solo React.
- Produces: `Avatar({ nombre: string, avatarUrl: string | null, size?: 'sm' | 'lg' })` desde `@/components/Avatar`. Tasks 3 y 4 lo consumen.

- [ ] **Step 1: Crear `components/Avatar.tsx`**

```tsx
export function Avatar({
  nombre,
  avatarUrl,
  size = 'sm',
}: {
  nombre: string
  avatarUrl: string | null
  size?: 'sm' | 'lg'
}) {
  const dimensiones = size === 'lg' ? 'h-24 w-24 text-3xl' : 'h-8 w-8 text-sm'

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatarUrl} alt={nombre} className={`${dimensiones} rounded-full object-cover`} />
    )
  }

  const inicial = nombre.trim().charAt(0).toUpperCase() || '?'

  return (
    <div
      className={`${dimensiones} flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-white`}
    >
      {inicial}
    </div>
  )
}
```

Se usa `<img>` en vez de `next/image` deliberadamente: las fotos de perfil son URLs remotas de Supabase Storage, y agregar ese dominio a `next.config` para el optimizador de imágenes de Next es complejidad innecesaria para thumbnails chicos — YAGNI.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Verificación visual rápida**

Este componente no tiene test automatizado (es presentación pura, sin fetch ni estado — patrón ya establecido de no testear componentes React en este proyecto). Se verifica visualmente en las Tasks 3 y 4, donde se usa de verdad.

- [ ] **Step 4: Commit**

```bash
git add components/Avatar.tsx
git commit -m "feat: agregar componente Avatar con fallback de iniciales"
```

---

### Task 3: Sidebar de navegación

**Files:**
- Create: `components/Sidebar.tsx`
- Modify: `app/(app)/layout.tsx` (reemplazo completo — 52 líneas actuales)

**Interfaces:**
- Consumes: `Avatar` de `@/components/Avatar` (Task 2); `obtenerOCrearPerfilActual` de `@/lib/data/perfiles` (Task 1); `Perfil` de `@/types/database` (Task 1); `Logo` de `@/components/Logo` (ya existe).
- Produces: `Sidebar({ children: React.ReactNode })` desde `@/components/Sidebar`, consumido por `app/(app)/layout.tsx` en este mismo task. Ninguna task posterior depende de `Sidebar`.

- [ ] **Step 1: Crear `components/Sidebar.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '@/components/Logo'
import { Avatar } from '@/components/Avatar'
import { obtenerOCrearPerfilActual } from '@/lib/data/perfiles'
import type { Perfil } from '@/types/database'

const LINKS = [
  { href: '/', label: 'Inicio' },
  { href: '/proveedores', label: 'Proveedores' },
  { href: '/productos', label: 'Productos' },
  { href: '/compras', label: 'Compras' },
  { href: '/stock', label: 'Stock' },
  { href: '/reportes', label: 'Reportes' },
]

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {LINKS.map((link) => {
        const activo = pathname === link.href
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={`rounded-full px-3.5 py-2 text-[13.5px] font-medium transition-colors duration-300 ${
              activo ? 'bg-white/10 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
            }`}
          >
            {link.label}
          </Link>
        )
      })}
    </>
  )
}

function PerfilYSalir({ perfil, onNavigate }: { perfil: Perfil | null; onNavigate?: () => void }) {
  return (
    <div className="mt-auto flex flex-col gap-1 border-t border-white/10 pt-3">
      <Link
        href="/perfil"
        onClick={onNavigate}
        className="flex items-center gap-2.5 rounded-full px-2.5 py-2 text-[13.5px] font-medium text-white/75 transition-colors duration-300 hover:bg-white/10 hover:text-white"
      >
        <Avatar nombre={perfil?.nombre ?? ''} avatarUrl={perfil?.avatar_url ?? null} size="sm" />
        Mi perfil
      </Link>
      <form action="/api/auth/signout" method="post">
        <button
          type="submit"
          className="w-full rounded-full px-3.5 py-2 text-left text-[13.5px] font-medium text-white/50 transition-colors duration-300 hover:bg-white/10 hover:text-white"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  )
}

export function Sidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [menuAbierto, setMenuAbierto] = useState(false)

  useEffect(() => {
    obtenerOCrearPerfilActual().then(setPerfil)
  }, [])

  return (
    <div className="min-h-screen bg-page md:flex">
      {/* Sidebar desktop: fija a la izquierda, ancho 240px (w-60) */}
      <aside className="sticky top-0 hidden h-screen w-60 flex-col gap-1 bg-accent-ink p-4 text-white md:flex">
        <Link href="/" className="mb-4 flex items-center pl-1">
          <Logo />
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          <NavLinks pathname={pathname} />
        </nav>
        <PerfilYSalir perfil={perfil} />
      </aside>

      <div className="flex-1">
        {/* Barra superior mobile: logo + hamburguesa */}
        <div className="sticky top-0 z-20 flex items-center justify-between bg-accent-ink px-4 py-3 text-white md:hidden">
          <Link href="/" className="flex items-center">
            <Logo />
          </Link>
          <button
            type="button"
            aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'}
            onClick={() => setMenuAbierto((v) => !v)}
            className="relative flex h-8 w-8 items-center justify-center"
          >
            <span
              className={`absolute h-[2px] w-5 bg-white transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                menuAbierto ? 'rotate-45' : '-translate-y-1.5'
              }`}
            />
            <span
              className={`absolute h-[2px] w-5 bg-white transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                menuAbierto ? '-rotate-45' : 'translate-y-1.5'
              }`}
            />
          </button>
        </div>

        {/* Backdrop mobile: toca para cerrar */}
        {menuAbierto && (
          <div
            className="fixed inset-0 z-10 bg-black/40 backdrop-blur-sm md:hidden"
            onClick={() => setMenuAbierto(false)}
          />
        )}

        {/* Panel deslizante mobile */}
        <aside
          className={`fixed inset-y-0 left-0 z-20 flex w-60 flex-col gap-1 bg-accent-ink p-4 text-white transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] md:hidden ${
            menuAbierto ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <Link href="/" className="mb-4 flex items-center pl-1" onClick={() => setMenuAbierto(false)}>
            <Logo />
          </Link>
          <nav className="flex flex-1 flex-col gap-1">
            <NavLinks pathname={pathname} onNavigate={() => setMenuAbierto(false)} />
          </nav>
          <PerfilYSalir perfil={perfil} onNavigate={() => setMenuAbierto(false)} />
        </aside>

        <main>{children}</main>
      </div>
    </div>
  )
}
```

Nota de implementación: en vez de un `margin-left` fijo en el contenido para "dejarle lugar" a la sidebar, se usa un layout flex (`md:flex` en el contenedor raíz, `aside` con `w-60` como primer hijo, `div` con `flex-1` como segundo) — logra exactamente el mismo resultado visual (sidebar fija a la izquierda, contenido ocupando el resto) sin depender de que el margen coincida a mano con el ancho de la sidebar.

- [ ] **Step 2: Reemplazar `app/(app)/layout.tsx` completo**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <Sidebar>{children}</Sidebar>
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Correr la suite de tests existente**

Run: `npx vitest run`
Expected: PASS — este task no toca ningún archivo con tests.

- [ ] **Step 5: Build de producción**

Run: `npm run build`
Expected: build limpio, las 17 rutas se generan sin errores (las 16 de antes más `/perfil`, que recién se crea en la Task 4 — si `/perfil` todavía no existe al correr este task, van a ser 16 rutas; confirmá que el número coincide con lo que había antes de este task, sin rutas rotas).

- [ ] **Step 6: Verificación manual en el navegador**

No hay credenciales de test disponibles en este entorno para loguearse — hacé la verificación estática que puedas (releer el JSX con cuidado, confirmar que las clases de Tailwind usadas existen en el sistema de diseño del proyecto: `bg-accent-ink`, `bg-accent`, `bg-page` están definidas en `app/globals.css`) y reportalo así en tu reporte. La verificación visual real en el navegador la hace el usuario después, junto con el controlador.

- [ ] **Step 7: Commit**

```bash
git add components/Sidebar.tsx "app/(app)/layout.tsx"
git commit -m "feat: reemplazar navegación horizontal por sidebar izquierda responsive"
```

---

### Task 4: Página `/perfil`

**Files:**
- Create: `app/(app)/perfil/page.tsx`

**Interfaces:**
- Consumes: `Avatar` de `@/components/Avatar` (Task 2); `obtenerOCrearPerfilActual`, `actualizarNombrePerfil`, `subirAvatar` de `@/lib/data/perfiles` (Task 1); `Perfil` de `@/types/database` (Task 1).
- Produces: nada que otra task consuma — es una página hoja.

- [ ] **Step 1: Crear `app/(app)/perfil/page.tsx`**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { obtenerOCrearPerfilActual, actualizarNombrePerfil, subirAvatar } from '@/lib/data/perfiles'
import type { Perfil } from '@/types/database'

const TAMANIO_MAXIMO_BYTES = 3 * 1024 * 1024

const INPUT_CLASS =
  'rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent'

export default function PerfilPage() {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [nombre, setNombre] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [archivoSeleccionado, setArchivoSeleccionado] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputArchivoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    obtenerOCrearPerfilActual().then((p) => {
      setPerfil(p)
      setNombre(p.nombre)
    })
  }, [])

  function handleSeleccionArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    if (archivo.size > TAMANIO_MAXIMO_BYTES) {
      setError('La imagen no puede superar los 3MB.')
      if (inputArchivoRef.current) inputArchivoRef.current.value = ''
      return
    }
    setError(null)
    setArchivoSeleccionado(archivo)
    setPreviewUrl(URL.createObjectURL(archivo))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      if (perfil && nombre !== perfil.nombre) {
        await actualizarNombrePerfil(nombre)
      }
      if (archivoSeleccionado) {
        await subirAvatar(archivoSeleccionado)
      }
      const actualizado = await obtenerOCrearPerfilActual()
      setPerfil(actualizado)
      setNombre(actualizado.nombre)
      setArchivoSeleccionado(null)
      setPreviewUrl(null)
    } catch (err) {
      setError('No se pudo guardar. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  if (!perfil) return <p className="p-8 text-sm text-ink-soft">Cargando…</p>

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 p-5 sm:p-8 rise">
      <div>
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Cuenta
        </p>
        <h1 className="mt-1 text-[27px] text-ink">Mi perfil</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Avatar nombre={nombre || perfil.nombre} avatarUrl={previewUrl ?? perfil.avatar_url} size="lg" />
          <button type="button" onClick={() => inputArchivoRef.current?.click()} className="pill-btn ghost">
            Cambiar foto
          </button>
          <input
            ref={inputArchivoRef}
            type="file"
            accept="image/*"
            onChange={handleSeleccionArchivo}
            className="hidden"
          />
        </div>

        <input
          required
          placeholder="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className={INPUT_CLASS}
        />

        {error && <p className="text-sm text-negative">{error}</p>}
        <button type="submit" disabled={saving} className="pill-btn justify-center disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Correr la suite de tests existente**

Run: `npx vitest run`
Expected: PASS — este task no toca ningún archivo con tests.

- [ ] **Step 4: Build de producción**

Run: `npm run build`
Expected: build limpio; ahora sí deben aparecer las 17 rutas, incluyendo `/perfil`.

- [ ] **Step 5: Verificación estática**

Sin credenciales de test disponibles para loguearse y probar la subida de archivos real — releé el código con cuidado: confirmá que `handleSubmit` llama `actualizarNombrePerfil` solo si el nombre cambió, que `subirAvatar` se llama solo si se seleccionó un archivo nuevo, y que el input de tipo `file` está oculto (`className="hidden"`) y se dispara con el botón "Cambiar foto" vía `inputArchivoRef.current?.click()`. Reportá esta limitación en tu reporte — la verificación real en navegador la hace el usuario después.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/perfil/page.tsx"
git commit -m "feat: agregar página /perfil para editar nombre y foto"
```

---

### Task 5: Saludo personalizado en el dashboard

**Files:**
- Modify: `app/(app)/page.tsx` (reemplazo completo — 190 líneas actuales)

**Interfaces:**
- Consumes: `obtenerOCrearPerfilActual` de `@/lib/data/perfiles` (Task 1); `Perfil` de `@/types/database` (Task 1).
- Produces: nada que otra task consuma — es la task final de esta tanda.

- [ ] **Step 1: Reemplazar `app/(app)/page.tsx` completo**

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listarFacturas } from '@/lib/data/facturas'
import { listarProveedores } from '@/lib/data/proveedores'
import { listarProductos } from '@/lib/data/productos'
import { calcularValorStock, calcularGastoPorSemana } from '@/lib/data/reportes'
import { obtenerOCrearPerfilActual } from '@/lib/data/perfiles'
import type { FacturaCompra, Proveedor, Producto, Perfil } from '@/types/database'

function StatShell({
  eyebrow,
  value,
  delta,
  children,
}: {
  eyebrow: string
  value: string
  delta?: { texto: string; positivo: boolean }
  children?: React.ReactNode
}) {
  return (
    <div className="shell rise">
      <div className="core flex h-full flex-col justify-between gap-4">
        <div className="flex items-start justify-between">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            {eyebrow}
          </p>
          {delta && (
            <span className={`chip ${delta.positivo ? 'up' : 'down'}`}>
              {delta.positivo ? '↑' : '↓'} {delta.texto}
            </span>
          )}
        </div>
        <p className="mono text-[27px] font-medium leading-none text-ink">{value}</p>
        {children}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [facturas, setFacturas] = useState<FacturaCompra[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([listarFacturas(), listarProveedores(), listarProductos(), obtenerOCrearPerfilActual()])
      .then(([f, p, pr, perf]) => {
        setFacturas(f)
        setProveedores(p)
        setProductos(pr)
        setPerfil(perf)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <p className="text-sm text-ink-soft">Cargando…</p>
  }

  const valorStock = calcularValorStock(productos)
  const hace30Dias = new Date()
  hace30Dias.setDate(hace30Dias.getDate() - 30)
  const hace60Dias = new Date()
  hace60Dias.setDate(hace60Dias.getDate() - 60)
  const facturasUltimos30 = facturas.filter(
    (f) => f.estado !== 'anulada' && new Date(f.fecha) >= hace30Dias
  )
  const facturas30a60 = facturas.filter(
    (f) => f.estado !== 'anulada' && new Date(f.fecha) >= hace60Dias && new Date(f.fecha) < hace30Dias
  )
  const gastoUltimos30 = facturasUltimos30.reduce((acc, f) => acc + f.total, 0)
  const gastoPrevios30 = facturas30a60.reduce((acc, f) => acc + f.total, 0)
  const variacionGasto =
    gastoPrevios30 > 0 ? ((gastoUltimos30 - gastoPrevios30) / gastoPrevios30) * 100 : null

  const productosStockBajo = productos.filter((p) => p.stock_actual <= p.stock_minimo)
  const ultimasFacturas = [...facturas].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 5)
  const semanas = calcularGastoPorSemana(facturas, 8)
  const maxSemana = Math.max(1, ...semanas.map((s) => s.total))

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="rise">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Panel general
        </p>
        <h1 className="mt-1 text-[27px] text-ink">Bienvenido, {perfil?.nombre ?? '...'}</h1>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <StatShell eyebrow="Valor total del stock" value={`$${valorStock.toLocaleString('es-AR')}`} />
        <StatShell
          eyebrow="Gasto en compras (30 días)"
          value={`$${gastoUltimos30.toLocaleString('es-AR')}`}
          delta={
            variacionGasto === null
              ? undefined
              : { texto: `${Math.abs(variacionGasto).toFixed(0)}%`, positivo: variacionGasto <= 0 }
          }
        />
        <StatShell eyebrow="Facturas cargadas" value={String(facturas.length)} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="shell rise lg:col-span-3">
          <div className="core">
            <div className="mb-6 flex items-center justify-between">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                Gasto por semana
              </p>
              <span className="mono text-xs text-ink-faint">últimas 8 semanas</span>
            </div>
            <div className="flex h-36 items-end gap-3">
              {semanas.map((s) => (
                <div key={s.semana} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className="w-full rounded-t-[8px] bg-accent transition-[height] duration-500"
                    style={{ height: `${Math.max(4, (s.total / maxSemana) * 100)}%` }}
                    title={`$${s.total.toLocaleString('es-AR')}`}
                  />
                  <span className="mono text-[10px] text-ink-faint">
                    {new Date(s.semana).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="shell rise lg:col-span-2">
          <div className="core">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                Stock bajo
              </p>
              <Link href="/stock" className="text-xs font-semibold text-accent hover:underline">
                Ver todo
              </Link>
            </div>
            <ul className="divide-y divide-line">
              {productosStockBajo.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-ink">{p.nombre}</span>
                  <span className="chip down">
                    {p.stock_actual} {p.unidad_stock}
                  </span>
                </li>
              ))}
              {productosStockBajo.length === 0 && (
                <li className="py-2.5 text-sm text-ink-faint">Ningún producto está bajo el mínimo.</li>
              )}
            </ul>
          </div>
        </div>
      </div>

      <div className="shell rise">
        <div className="core">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Últimas facturas
            </p>
            <Link href="/compras" className="text-xs font-semibold text-accent hover:underline">
              Ver todo
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {ultimasFacturas.map((f) => {
              const proveedor = proveedores.find((p) => p.id === f.proveedor_id)
              return (
                <li key={f.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-ink">
                    <span className="mono text-ink-faint">{f.fecha}</span> — {proveedor?.nombre ?? '—'}
                    {f.estado === 'anulada' && <span className="chip down ml-2">ANULADA</span>}
                  </span>
                  <span className="mono font-semibold text-ink">${f.total.toLocaleString('es-AR')}</span>
                </li>
              )
            })}
            {ultimasFacturas.length === 0 && (
              <li className="py-2.5 text-sm text-ink-faint">Sin facturas aún.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}
```

Único cambio de contenido respecto al archivo actual: se agrega `perfil` al estado y al `Promise.all` del `useEffect`, y el título pasa de `Inicio` a `Bienvenido, {perfil?.nombre ?? '...'}`. El resto del archivo (stats, gráfico de gasto semanal, stock bajo, últimas facturas) queda idéntico.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Correr la suite de tests existente**

Run: `npx vitest run`
Expected: PASS — este task no toca ningún archivo con tests.

- [ ] **Step 4: Build de producción**

Run: `npm run build`
Expected: build limpio, las 17 rutas (incluyendo `/perfil` de la Task 4) se generan sin errores.

- [ ] **Step 5: Verificación estática**

Sin credenciales de test disponibles — confirmá leyendo el código que `perfil?.nombre ?? '...'` es alcanzable solo de forma transitoria (en la práctica `loading` sigue en `true`, mostrando "Cargando…", hasta que el mismo `Promise.all` que trae `perfil` resuelve, así que para cuando se renderiza el título `perfil` ya está seteado). Reportá esta limitación — la verificación real del saludo con el nombre correcto la hace el usuario después.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/page.tsx"
git commit -m "feat: agregar saludo personalizado al dashboard usando el perfil"
```

---

## Self-Review

**1. Cobertura del spec:**
- Parte 1 (Sidebar desktop fija + mobile hamburguesa/panel/backdrop, link activo resaltado, avatar+nombre+cerrar sesión al fondo) → Task 3. ✅
- Parte 2 (tabla `perfiles` + RLS, bucket `avatars` + políticas de Storage, alta automática con manejo de carrera, `actualizarNombrePerfil`/`subirAvatar`, página `/perfil` con formulario nombre+foto y validación de 3MB) → Tasks 1 y 4. ✅
- Parte 3 (`Avatar` con fallback de iniciales sobre `bg-accent`, saludo "Bienvenido, {nombre}" en el dashboard) → Tasks 2 y 5. ✅
- "Fuera de alcance" (panel de admin, cambio de email/contraseña, crop/resize, caché global) → ninguna task los implementa. ✅

**2. Placeholders:** ninguno — todo el código de cada task es el código real, completo, a escribir.

**3. Consistencia de tipos:**
- `Perfil { id: string; nombre: string; avatar_url: string | null; created_at: string }` — definido en Task 1, usado idéntico en Tasks 3, 4 y 5 (siempre `perfil?.nombre`, `perfil?.avatar_url`, nunca un campo inventado).
- `obtenerOCrearPerfilActual(): Promise<Perfil>`, `actualizarNombrePerfil(nombre: string): Promise<void>`, `subirAvatar(file: File): Promise<string>` — firmas definidas en Task 1, consumidas exactamente así en Tasks 3, 4 y 5 (ninguna task pasa argumentos extra ni espera un tipo de retorno distinto).
- `Avatar({ nombre: string, avatarUrl: string | null, size?: 'sm' | 'lg' })` — definido en Task 2, consumido con esos mismos 3 props (nunca más) en Tasks 3 y 4.
- El bucket `'avatars'` y la ruta `<user_id>/avatar.<ext>` coinciden entre la política SQL de Storage (Task 1, Step 1) y el código de `subirAvatar` (Task 1, Step 5) — ambos usan `(storage.foldername(name))[1]` / `${user.id}/avatar.${extension}` sobre el mismo bucket.
