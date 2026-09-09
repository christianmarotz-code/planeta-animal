# Roles de Usuario (Administrador/Empleado) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar dos roles (`administrador`/`empleado`) a Planeta Animal: el administrador ve y hace todo; el empleado opera el día a día sin ver ningún monto de dinero, y el administrador puede invitar gente nueva y asignarle un rol desde la propia app.

**Architecture:** Una columna `rol` en `perfiles` (default `empleado`) es la fuente de verdad. Un hook cliente (`useEsAdministrador`) y chequeos directos sobre el `perfil` ya cargado deciden qué renderizar en cada página — la restricción es solo visual (Enfoque A de la spec), salvo la creación/gestión de cuentas, que corre en un Route Handler de servidor con la `service_role key` de Supabase y verifica el rol de quien llama antes de hacer nada.

**Tech Stack:** Next.js 16 (App Router, TypeScript), Supabase (Postgres, Auth, `@supabase/supabase-js` para el cliente admin), Tailwind CSS v4.

**Spec:** `docs/superpowers/specs/2026-09-09-roles-administrador-empleado-design.md`

## Global Constraints

- `perfiles.rol` acepta únicamente `'administrador'` o `'empleado'`, default `'empleado'` (el más restrictivo).
- La restricción de contenido financiero es solo visual (Enfoque A de la spec) — ninguna tabla existente cambia sus políticas RLS en este plan.
- La única barrera real de seguridad es `app/api/usuarios/route.ts`: verifica en el servidor que quien llama es `administrador` antes de cualquier operación — nunca confía en lo que el cliente dice ser.
- La `service_role key` de Supabase vive únicamente en la variable de entorno `SUPABASE_SERVICE_ROLE_KEY` (sin prefijo `NEXT_PUBLIC_`) y solo se usa desde `lib/supabase/admin.ts`, importado únicamente por Route Handlers — nunca desde un componente `'use client'`.
- Nadie puede cambiar su propio rol desde `/usuarios` — ni en la UI ni en el servidor.
- El empleado nunca ve un monto de dinero en pantalla, en ningún lugar de la app — esto incluye cualquier lugar donde ya se muestre `$`, no solo los mencionados explícitamente en la spec (ej. el historial de compras dentro de la ficha de un proveedor).
- El empleado sí puede: crear/editar proveedores y productos (sin sus campos financieros), ajustar stock manualmente, ver el historial de movimientos de stock, y anular una factura de compra.
- El empleado no puede: cargar una factura nueva, ver la página de Reportes, ni acceder a la página de Usuarios.
- Ningún archivo de este plan lleva tests automatizados — `lib/data/*.ts`, el Route Handler de servidor, y los componentes de página no se testean en este proyecto (patrón ya establecido); `app/api/usuarios/route.ts` además depende de Supabase Auth real, imposible de simular sin credenciales.
- Todas las páginas ya cargan sus propios datos con `useEffect` + `useState` (sin caché global) — este plan sigue ese mismo patrón para el rol.

---

## Estado actual de los archivos relevantes

- **`types/database.ts`** (111 líneas): ya tiene `Perfil { id, nombre, avatar_url, created_at }` y el resto de las interfaces de Fase 1. No tiene ningún concepto de rol.
- **`lib/data/perfiles.ts`**: ya tiene `obtenerOCrearPerfilActual()`, `actualizarNombrePerfil()`, `subirAvatar()` — no necesita cambios de código en este plan (una vez que la columna `rol` exista, `select('*')` ya la trae).
- **`components/Sidebar.tsx`** (146 líneas): ya carga `perfil` en su propio estado (para nombre/avatar) vía `obtenerOCrearPerfilActual()`. `LINKS` es un array fijo de 6 entradas sin ningún concepto de visibilidad condicional.
- **`app/(app)/page.tsx`** (205 líneas): ya carga `perfil`/`perfilError` en su propio `useEffect`, independiente de facturas/proveedores/productos (separación ya hecha en una feature anterior).
- **`app/(app)/reportes/page.tsx`** (159 líneas): sin ningún chequeo de rol hoy.
- **`app/(app)/proveedores/ProveedorForm.tsx`** (176 líneas): panel de impuestos siempre visible, sin ningún prop de rol.
- **`app/(app)/proveedores/[id]/page.tsx`** (58 líneas): la sección "Historial de compras" muestra `$${f.total}` sin ninguna restricción.
- **`app/(app)/productos/page.tsx`** (102 líneas) y **`app/(app)/productos/[id]/page.tsx`** (43 líneas): ambos muestran `costo_unitario_actual` sin restricción. `ProductoForm.tsx` no tiene ningún campo de costo (se puede confirmar: no aparece la palabra "costo" en ese archivo), así que no necesita cambios.
- **`app/(app)/stock/page.tsx`** (145 líneas): muestra "Valor (costo × stock)" por producto sin restricción; no tiene ninguna sección de historial de movimientos.
- **`app/(app)/compras/page.tsx`** (72 líneas): siempre muestra el link "+ Nueva factura" y el monto de cada factura en la lista.
- **`app/(app)/compras/[id]/page.tsx`** (153 líneas): tabla de items con columnas "Costo neto"/"Costo real"/"Subtotal", párrafo explicativo del cálculo, y resumen Subtotal/IVA/Total — todo sin restricción. El botón "Anular factura" queda igual para ambos roles.
- **`app/(app)/compras/nueva/page.tsx`** (339 líneas): página completa de carga de facturas, sin ningún chequeo de rol.
- **`lib/data/stock.ts`**: ya tiene `ajustarStockManual()`. `MovimientoStock` (en `types/database.ts`) ya existe como tabla e interfaz — nunca tuvo ningún campo de dinero (`id, producto_id, tipo, cantidad, fecha, factura_id, motivo, usuario_id`).
- **`.env.local.example`**: solo tiene `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **`@supabase/supabase-js`** ya es una dependencia directa del proyecto (`package.json`) — no hace falta instalar nada nuevo.

---

### Task 1: Rol en el modelo de datos + hook `useEsAdministrador`

**Files:**
- Create: `supabase/migrations/0007_roles.sql`
- Modify: `types/database.ts`
- Create: `lib/hooks/useEsAdministrador.ts`

**Interfaces:**
- Consumes: `obtenerOCrearPerfilActual()` de `@/lib/data/perfiles` (ya existe, sin cambios de código — trae `rol` automáticamente una vez que exista la columna).
- Produces: tipo `RolPerfil = 'administrador' | 'empleado'` y campo `Perfil.rol: RolPerfil` (`@/types/database`); hook `useEsAdministrador(): boolean | null` desde `@/lib/hooks/useEsAdministrador` — `null` mientras carga, `true`/`false` una vez resuelto (en error, `false` — falla cerrado). Tasks 6, 7, 8, 10 lo consumen. `RolPerfil` lo consumen las Tasks 2 y 3.

- [ ] **Step 1: Crear la migración SQL**

Crear `supabase/migrations/0007_roles.sql` con este contenido exacto:

```sql
alter table perfiles add column rol text not null default 'empleado'
  check (rol in ('administrador', 'empleado'));

-- Promueve al único usuario existente del sistema a administrador.
-- Si para cuando corras esto ya hay más de un perfil creado, ajustá el
-- WHERE para apuntar solo a la cuenta correcta antes de ejecutar.
update perfiles set rol = 'administrador';
```

No la ejecutes contra ninguna base — el usuario la corre manualmente en el SQL Editor de Supabase después de que este task se revise.

- [ ] **Step 2: Agregar `RolPerfil` y el campo `rol` a `types/database.ts`**

En `types/database.ts`, agregar esta línea inmediatamente antes de `export interface Perfil {` (línea 80 actual):

```ts
export type RolPerfil = 'administrador' | 'empleado'
```

Y dentro de la interfaz `Perfil` (líneas 80-85 actuales), agregar el campo `rol` después de `avatar_url`:

```ts
export interface Perfil {
  id: string
  nombre: string
  avatar_url: string | null
  rol: RolPerfil
  created_at: string
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Crear `lib/hooks/useEsAdministrador.ts`**

```ts
'use client'

import { useEffect, useState } from 'react'
import { obtenerOCrearPerfilActual } from '@/lib/data/perfiles'

export function useEsAdministrador(): boolean | null {
  const [esAdmin, setEsAdmin] = useState<boolean | null>(null)

  useEffect(() => {
    obtenerOCrearPerfilActual()
      .then((perfil) => setEsAdmin(perfil.rol === 'administrador'))
      .catch(() => setEsAdmin(false))
  }, [])

  return esAdmin
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Correr la suite de tests existente**

Run: `npx vitest run`
Expected: PASS — este task no agrega ni modifica ningún test; los 35 tests existentes siguen en verde.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0007_roles.sql types/database.ts lib/hooks/useEsAdministrador.ts
git commit -m "feat: agregar rol de usuario (administrador/empleado) al modelo de datos"
```

---

### Task 2: Cliente admin de Supabase + API de usuarios

**Files:**
- Create: `lib/supabase/admin.ts`
- Create: `app/api/usuarios/route.ts`
- Modify: `.env.local.example`

**Interfaces:**
- Consumes: `RolPerfil` de `@/types/database` (Task 1); `createClient` de `@/lib/supabase/server` (ya existe, sin cambios).
- Produces: `createAdminClient()` desde `@/lib/supabase/admin`, usado únicamente dentro de `app/api/usuarios/route.ts`. Las rutas `GET`/`POST`/`PATCH` de `/api/usuarios` — la Task 3 las consume vía `fetch`.

- [ ] **Step 1: Crear `lib/supabase/admin.ts`**

```ts
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Cliente con la service_role key de Supabase — bypassa RLS por completo.
// Nunca importar este archivo desde un componente 'use client': la clave
// solo debe existir en el servidor (Route Handlers).
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

- [ ] **Step 2: Agregar la variable de entorno nueva a `.env.local.example`**

`.env.local.example` queda así (agregando la tercera línea):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 3: Crear `app/api/usuarios/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { RolPerfil } from '@/types/database'

type ResultadoAuth =
  | { error: NextResponse; user?: undefined }
  | { error?: undefined; user: { id: string } }

async function requerirAdministrador(): Promise<ResultadoAuth> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  }

  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'administrador') {
    return { error: NextResponse.json({ error: 'Acceso restringido' }, { status: 403 }) }
  }
  return { user }
}

export async function GET() {
  const { error } = await requerirAdministrador()
  if (error) return error

  const admin = createAdminClient()
  const { data: authData, error: errorAuth } = await admin.auth.admin.listUsers()
  if (errorAuth) return NextResponse.json({ error: errorAuth.message }, { status: 500 })

  const { data: perfiles, error: errorPerfiles } = await admin.from('perfiles').select('*')
  if (errorPerfiles) return NextResponse.json({ error: errorPerfiles.message }, { status: 500 })

  const usuarios = (perfiles ?? []).map((perfil) => {
    const authUser = authData.users.find((u) => u.id === perfil.id)
    return {
      id: perfil.id,
      email: authUser?.email ?? '—',
      nombre: perfil.nombre,
      rol: perfil.rol,
    }
  })

  return NextResponse.json({ usuarios })
}

export async function POST(request: Request) {
  const { error } = await requerirAdministrador()
  if (error) return error

  const body = await request.json()
  const { email, nombre, rol } = body as { email: string; nombre: string; rol: RolPerfil }
  if (!email || !nombre || (rol !== 'administrador' && rol !== 'empleado')) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: invitado, error: errorInvitar } = await admin.auth.admin.inviteUserByEmail(email)
  if (errorInvitar) return NextResponse.json({ error: errorInvitar.message }, { status: 500 })

  const { error: errorPerfil } = await admin
    .from('perfiles')
    .insert({ id: invitado.user.id, nombre, avatar_url: null, rol } as never)
  if (errorPerfil) return NextResponse.json({ error: errorPerfil.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function PATCH(request: Request) {
  const { error, user } = await requerirAdministrador()
  if (error) return error

  const body = await request.json()
  const { id, rol } = body as { id: string; rol: RolPerfil }
  if (!id || (rol !== 'administrador' && rol !== 'empleado')) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }
  if (id === user.id) {
    return NextResponse.json({ error: 'No podés cambiar tu propio rol.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error: errorUpdate } = await admin.from('perfiles').update({ rol } as never).eq('id', id)
  if (errorUpdate) return NextResponse.json({ error: errorUpdate.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Correr la suite de tests existente**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Build de producción**

Run: `npm run build`
Expected: build limpio; `/api/usuarios` aparece en la lista de rutas generadas (como función serverless, no como página).

- [ ] **Step 7: Verificación estática**

Sin `SUPABASE_SERVICE_ROLE_KEY` real ni credenciales de test en este entorno, no se puede probar contra Supabase de verdad. Releé `requerirAdministrador()` con cuidado: confirmá que los 3 métodos (`GET`/`POST`/`PATCH`) llaman a esa función ANTES de tocar `createAdminClient()`, y que ninguno de los 3 puede llegar a usar el cliente admin sin haber confirmado primero que quien llama es `administrador`. Reportá esta limitación — la prueba real contra Supabase la hace el usuario después de correr la migración y configurar `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] **Step 8: Commit**

```bash
git add lib/supabase/admin.ts "app/api/usuarios/route.ts" .env.local.example
git commit -m "feat: agregar API de servidor para invitar usuarios y asignar roles"
```

---

### Task 3: Pantalla `/usuarios`

**Files:**
- Create: `lib/data/usuarios.ts`
- Create: `app/(app)/usuarios/page.tsx`

**Interfaces:**
- Consumes: rutas `GET`/`POST`/`PATCH` de `/api/usuarios` (Task 2); `obtenerOCrearPerfilActual()` de `@/lib/data/perfiles` (ya existe); `RolPerfil` de `@/types/database` (Task 1).
- Produces: `UsuarioConEmail { id, email, nombre, rol }`, `listarUsuarios(): Promise<UsuarioConEmail[]>`, `invitarUsuario({ email, nombre, rol }): Promise<void>`, `actualizarRolUsuario(id, rol): Promise<void>` desde `@/lib/data/usuarios`. Ninguna task posterior las consume — es una página hoja.

- [ ] **Step 1: Crear `lib/data/usuarios.ts`**

```ts
import type { RolPerfil } from '@/types/database'

export interface UsuarioConEmail {
  id: string
  email: string
  nombre: string
  rol: RolPerfil
}

async function parsearRespuesta(res: Response) {
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Error inesperado')
  return body
}

export async function listarUsuarios(): Promise<UsuarioConEmail[]> {
  const res = await fetch('/api/usuarios')
  const body = await parsearRespuesta(res)
  return body.usuarios
}

export async function invitarUsuario(input: {
  email: string
  nombre: string
  rol: RolPerfil
}): Promise<void> {
  const res = await fetch('/api/usuarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  await parsearRespuesta(res)
}

export async function actualizarRolUsuario(id: string, rol: RolPerfil): Promise<void> {
  const res = await fetch('/api/usuarios', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, rol }),
  })
  await parsearRespuesta(res)
}
```

- [ ] **Step 2: Crear `app/(app)/usuarios/page.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import {
  listarUsuarios,
  invitarUsuario,
  actualizarRolUsuario,
  type UsuarioConEmail,
} from '@/lib/data/usuarios'
import { obtenerOCrearPerfilActual } from '@/lib/data/perfiles'
import type { Perfil, RolPerfil } from '@/types/database'

const INPUT_CLASS =
  'rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent'

export default function UsuariosPage() {
  const [perfilActual, setPerfilActual] = useState<Perfil | null>(null)
  const [usuarios, setUsuarios] = useState<UsuarioConEmail[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState<RolPerfil>('empleado')
  const [invitando, setInvitando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function cargarUsuarios() {
    listarUsuarios()
      .then(setUsuarios)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    obtenerOCrearPerfilActual().then(setPerfilActual)
  }, [])

  useEffect(() => {
    if (perfilActual?.rol === 'administrador') cargarUsuarios()
  }, [perfilActual])

  async function handleInvitar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInvitando(true)
    try {
      await invitarUsuario({ email, nombre, rol })
      setEmail('')
      setNombre('')
      setRol('empleado')
      cargarUsuarios()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo invitar. Intentá de nuevo.')
    } finally {
      setInvitando(false)
    }
  }

  async function handleCambiarRol(id: string, nuevoRol: RolPerfil) {
    setError(null)
    try {
      await actualizarRolUsuario(id, nuevoRol)
      cargarUsuarios()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el rol.')
    }
  }

  if (!perfilActual) return <p className="p-8 text-sm text-ink-soft">Cargando…</p>

  if (perfilActual.rol !== 'administrador') {
    return (
      <p className="p-8 text-sm text-negative">
        Acceso restringido — contactá a un administrador.
      </p>
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-5 sm:p-8 rise">
      <div>
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Gestión
        </p>
        <h1 className="mt-1 text-[27px] text-ink">Usuarios</h1>
      </div>

      <div className="shell rise">
        <div className="core">
          <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Invitar a alguien nuevo
          </p>
          <form onSubmit={handleInvitar} className="flex flex-wrap items-end gap-3">
            <input
              required
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`${INPUT_CLASS} w-56`}
            />
            <input
              required
              placeholder="Nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className={`${INPUT_CLASS} w-44`}
            />
            <select value={rol} onChange={(e) => setRol(e.target.value as RolPerfil)} className={INPUT_CLASS}>
              <option value="empleado">Empleado</option>
              <option value="administrador">Administrador</option>
            </select>
            <button type="submit" disabled={invitando} className="pill-btn disabled:opacity-50">
              {invitando ? 'Invitando…' : 'Invitar'}
            </button>
          </form>
          {error && <p className="mt-3 text-sm text-negative">{error}</p>}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-ink-soft">Cargando…</p>
      ) : (
        <div className="card rise divide-y divide-line">
          {usuarios.map((u) => (
            <div key={u.id} className="flex items-center justify-between px-5 py-3.5 text-sm">
              <span className="text-ink">
                {u.nombre} <span className="text-ink-faint">— {u.email}</span>
              </span>
              {u.id === perfilActual.id ? (
                <span className="chip up">
                  {u.rol === 'administrador' ? 'Administrador' : 'Empleado'}
                </span>
              ) : (
                <select
                  value={u.rol}
                  onChange={(e) => handleCambiarRol(u.id, e.target.value as RolPerfil)}
                  className={INPUT_CLASS}
                >
                  <option value="empleado">Empleado</option>
                  <option value="administrador">Administrador</option>
                </select>
              )}
            </div>
          ))}
          {usuarios.length === 0 && <p className="px-5 py-6 text-sm text-ink-faint">Sin usuarios.</p>}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Correr la suite de tests existente**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Build de producción**

Run: `npm run build`
Expected: build limpio; `/usuarios` aparece en la lista de rutas.

- [ ] **Step 6: Verificación estática**

Sin credenciales de test disponibles — releé `handleCambiarRol` y confirmá que el `<select>` de cambio de rol solo se renderiza para filas donde `u.id !== perfilActual.id` (la propia fila del admin logueado muestra un `chip` de solo lectura, nunca un selector). Reportá esta limitación.

- [ ] **Step 7: Commit**

```bash
git add lib/data/usuarios.ts "app/(app)/usuarios/page.tsx"
git commit -m "feat: agregar página /usuarios para invitar personas y asignar roles"
```

---

### Task 4: Sidebar — ocultar Reportes/Usuarios para empleados

**Files:**
- Modify: `components/Sidebar.tsx` (reemplazo completo — 146 líneas actuales)

**Interfaces:**
- Consumes: `perfil.rol` (Task 1) — ya disponible en el estado `perfil` que `Sidebar` ya carga, sin fetch nuevo.
- Produces: nada que otra task consuma.

- [ ] **Step 1: Reemplazar `components/Sidebar.tsx` completo**

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
  { href: '/reportes', label: 'Reportes', soloAdmin: true },
  { href: '/usuarios', label: 'Usuarios', soloAdmin: true },
]

function NavLinks({
  pathname,
  esAdmin,
  onNavigate,
}: {
  pathname: string
  esAdmin: boolean
  onNavigate?: () => void
}) {
  return (
    <>
      {LINKS.filter((link) => !link.soloAdmin || esAdmin).map((link) => {
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
        <span className="flex flex-col leading-tight">
          <span className="text-white">{perfil?.nombre ?? '...'}</span>
          <span className="text-[11px] text-white/50">Mi perfil</span>
        </span>
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
  const esAdmin = perfil?.rol === 'administrador'

  useEffect(() => {
    obtenerOCrearPerfilActual()
      .then(setPerfil)
      .catch((err) => console.error('No se pudo cargar el perfil', err))
  }, [])

  return (
    <div className="min-h-screen bg-page md:flex">
      {/* Sidebar desktop: fija a la izquierda, ancho 240px (w-60) */}
      <aside className="sticky top-0 hidden h-screen w-60 flex-col gap-1 bg-accent-ink p-4 text-white md:flex">
        <Link href="/" className="mb-4 flex items-center pl-1">
          <Logo />
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          <NavLinks pathname={pathname} esAdmin={esAdmin} />
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
          inert={!menuAbierto}
          className={`fixed inset-y-0 left-0 z-20 flex w-60 flex-col gap-1 bg-accent-ink p-4 text-white transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] md:hidden ${
            menuAbierto ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <Link href="/" className="mb-4 flex items-center pl-1" onClick={() => setMenuAbierto(false)}>
            <Logo />
          </Link>
          <nav className="flex flex-1 flex-col gap-1">
            <NavLinks pathname={pathname} esAdmin={esAdmin} onNavigate={() => setMenuAbierto(false)} />
          </nav>
          <PerfilYSalir perfil={perfil} onNavigate={() => setMenuAbierto(false)} />
        </aside>

        <main>{children}</main>
      </div>
    </div>
  )
}
```

Único cambio de contenido respecto al archivo actual: `LINKS` agrega `soloAdmin: true` a "Reportes" y una entrada nueva "Usuarios" (también `soloAdmin: true`); `NavLinks` recibe un prop `esAdmin: boolean` y filtra los links con `soloAdmin` antes de mapearlos; `Sidebar` deriva `esAdmin` del `perfil` que ya tenía cargado (`perfil?.rol === 'administrador'`) y lo pasa a las dos instancias de `NavLinks` (desktop y mobile). El resto del archivo queda idéntico.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Correr la suite de tests existente**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 4: Build de producción**

Run: `npm run build`
Expected: build limpio; mismas rutas que antes de este task (este task no agrega rutas).

- [ ] **Step 5: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat: ocultar Reportes y Usuarios en la sidebar para empleados"
```

---

### Task 5: Dashboard — ocultar widgets financieros para empleados

**Files:**
- Modify: `app/(app)/page.tsx` (reemplazo completo — 205 líneas actuales)

**Interfaces:**
- Consumes: `perfil.rol` (Task 1) — ya disponible en el estado `perfil` que esta página ya carga, sin fetch nuevo.
- Produces: nada que otra task consuma.

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
  const [perfilError, setPerfilError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([listarFacturas(), listarProveedores(), listarProductos()])
      .then(([f, p, pr]) => {
        setFacturas(f)
        setProveedores(p)
        setProductos(pr)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    obtenerOCrearPerfilActual()
      .then(setPerfil)
      .catch(() => setPerfilError(true))
  }, [])

  if (loading) {
    return <p className="text-sm text-ink-soft">Cargando…</p>
  }

  const esAdmin = perfil?.rol === 'administrador'

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
        <h1 className="mt-1 text-[27px] text-ink">
          {perfil?.nombre ? `Bienvenido, ${perfil.nombre}` : 'Bienvenido'}
        </h1>
        {perfilError && <p className="text-xs text-negative">No se pudo cargar tu perfil.</p>}
      </div>

      {esAdmin && (
        <>
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

          <div className="shell rise">
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
        </>
      )}

      <div className="shell rise">
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

      {esAdmin && (
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
      )}
    </div>
  )
}
```

Único cambio de contenido respecto al archivo actual: se agrega `const esAdmin = perfil?.rol === 'administrador'`, y las 3 tarjetas de KPI + el gráfico de gasto semanal + "Últimas facturas" quedan envueltas en `{esAdmin && (...)}`. "Stock bajo" queda igual, visible siempre. El resto (fetch de datos, cálculos) no cambia.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Correr la suite de tests existente**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 4: Build de producción**

Run: `npm run build`
Expected: build limpio.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/page.tsx"
git commit -m "feat: ocultar widgets financieros del dashboard para empleados"
```

---

### Task 6: Reportes — bloquear página completa para empleados

**Files:**
- Modify: `app/(app)/reportes/page.tsx` (agregar 2 líneas de import + 1 hook + 2 early-returns; no reemplaza el resto)

**Interfaces:**
- Consumes: `useEsAdministrador()` de `@/lib/hooks/useEsAdministrador` (Task 1).
- Produces: nada que otra task consuma.

- [ ] **Step 1: Agregar el import del hook**

En `app/(app)/reportes/page.tsx`, agregar esta línea después del import de `'@/lib/data/reportes'` (después de la línea 13 actual, antes de `import type { FacturaCompra, Proveedor, Producto } from '@/types/database'`):

```ts
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
```

- [ ] **Step 2: Agregar el chequeo de rol al principio del componente**

Reemplazar:

```ts
export default function ReportesPage() {
  const [facturas, setFacturas] = useState<FacturaCompra[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos, setProductos] = useState<Producto[]>([])

  useEffect(() => {
    listarFacturas().then(setFacturas)
    listarProveedores().then(setProveedores)
    listarProductos().then(setProductos)
  }, [])
```

por:

```ts
export default function ReportesPage() {
  const esAdmin = useEsAdministrador()
  const [facturas, setFacturas] = useState<FacturaCompra[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos, setProductos] = useState<Producto[]>([])

  useEffect(() => {
    listarFacturas().then(setFacturas)
    listarProveedores().then(setProveedores)
    listarProductos().then(setProductos)
  }, [])

  if (esAdmin === null) return <p className="p-8 text-sm text-ink-soft">Cargando…</p>
  if (esAdmin === false) {
    return (
      <p className="p-8 text-sm text-negative">
        Acceso restringido — contactá a un administrador.
      </p>
    )
  }
```

El resto del archivo (cálculos, `GraficoBarras`, el JSX de las secciones) queda idéntico — los early-returns antes de `const gastoPorProveedor = ...` bloquean el render para quien no sea admin, sin tocar el resto de la lógica.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Correr la suite de tests existente**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Build de producción**

Run: `npm run build`
Expected: build limpio.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/reportes/page.tsx"
git commit -m "feat: bloquear la página de Reportes para empleados"
```

---

### Task 7: Proveedores — ocultar impuestos y montos del historial de compras

**Files:**
- Modify: `app/(app)/proveedores/ProveedorForm.tsx` (agregar prop `esAdministrador`)
- Modify: `app/(app)/proveedores/nuevo/page.tsx` (pasar el prop nuevo)
- Modify: `app/(app)/proveedores/[id]/page.tsx` (pasar el prop nuevo + ocultar montos del historial)

**Interfaces:**
- Consumes: `useEsAdministrador()` de `@/lib/hooks/useEsAdministrador` (Task 1).
- Produces: `ProveedorForm` gana un prop requerido `esAdministrador: boolean`. Ninguna task posterior lo consume.

- [ ] **Step 1: Agregar el prop `esAdministrador` a `ProveedorForm`**

En `app/(app)/proveedores/ProveedorForm.tsx`, cambiar la firma de la función (líneas 23-31 actuales):

```tsx
export function ProveedorForm({
  initial,
  onSubmit,
  submitLabel,
}: {
  initial?: Partial<Proveedor>
  onSubmit: (values: ProveedorFormValues) => Promise<void>
  submitLabel: string
}) {
```

por:

```tsx
export function ProveedorForm({
  initial,
  onSubmit,
  submitLabel,
  esAdministrador,
}: {
  initial?: Partial<Proveedor>
  onSubmit: (values: ProveedorFormValues) => Promise<void>
  submitLabel: string
  esAdministrador: boolean
}) {
```

Y envolver el panel de impuestos (el `<div className="mt-2 rounded-[var(--r-lg)] ...">` que empieza en la línea 106 actual y termina en la línea 167 actual, justo antes de `{error && <p className="text-sm text-negative">{error}</p>}`) en `{esAdministrador && (...)}`:

```tsx
      {esAdministrador && (
        <div className="mt-2 rounded-[var(--r-lg)] border border-line bg-surface-sunk p-3.5">
          <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
            Impuestos y descuentos de este proveedor
          </p>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={values.aplica_iibb}
                  onChange={(e) => set('aplica_iibb', e.target.checked)}
                  className="accent-accent"
                />
                Aplica Ingresos Brutos (II.BB.)
              </label>
              {values.aplica_iibb && (
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={values.tasa_iibb}
                  onChange={(e) => set('tasa_iibb', Number(e.target.value))}
                  className={`${INPUT_CLASS} w-20`}
                  aria-label="Tasa de II.BB. (%)"
                />
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={values.aplica_perc_iva}
                  onChange={(e) => set('aplica_perc_iva', e.target.checked)}
                  className="accent-accent"
                />
                Aplica Percepción de IVA
              </label>
              {values.aplica_perc_iva && (
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={values.tasa_perc_iva}
                  onChange={(e) => set('tasa_perc_iva', Number(e.target.value))}
                  className={`${INPUT_CLASS} w-20`}
                  aria-label="Tasa de percepción de IVA (%)"
                />
              )}
            </div>
            <label className="text-sm text-ink-soft">
              Descuento por pronto pago (%)
              <input
                type="number"
                min={0}
                step="any"
                value={values.descuento_pronto_pago}
                onChange={(e) => set('descuento_pronto_pago', Number(e.target.value))}
                className={`${INPUT_CLASS} mt-1 w-full`}
              />
            </label>
          </div>
        </div>
      )}
```

- [ ] **Step 2: Pasar el prop desde `app/(app)/proveedores/nuevo/page.tsx`**

En ese archivo, agregar el import del hook después de `import { ProveedorForm } from '../ProveedorForm'`:

```ts
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
```

Y dentro de `NuevoProveedorPage`, agregar `const esAdmin = useEsAdministrador()` como primera línea del componente, y pasar `esAdministrador={esAdmin === true}` a `<ProveedorForm>`:

```tsx
export default function NuevoProveedorPage() {
  const esAdmin = useEsAdministrador()
  const router = useRouter()
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 p-5 sm:p-8 rise">
      <div>
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Gestión
        </p>
        <h1 className="mt-1 text-[27px] text-ink">Nuevo proveedor</h1>
      </div>
      <ProveedorForm
        esAdministrador={esAdmin === true}
        submitLabel="Crear proveedor"
        onSubmit={async (values) => {
          await crearProveedor(values)
          router.push('/proveedores')
        }}
      />
    </div>
  )
}
```

- [ ] **Step 3: Pasar el prop y ocultar montos en `app/(app)/proveedores/[id]/page.tsx`**

Agregar el import del hook después de `import { ProveedorForm } from '../ProveedorForm'`:

```ts
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
```

Reemplazar el cuerpo del componente completo:

```tsx
export default function EditarProveedorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const esAdmin = useEsAdministrador()
  const [proveedor, setProveedor] = useState<Proveedor | null>(null)
  const [facturas, setFacturas] = useState<FacturaCompra[]>([])

  useEffect(() => {
    obtenerProveedor(id).then(setProveedor)
    listarFacturas({ proveedorId: id }).then(setFacturas)
  }, [id])

  if (!proveedor) return <p className="p-8 text-sm text-ink-soft">Cargando…</p>

  return (
    <div className="mx-auto flex max-w-md flex-col gap-8 p-5 sm:p-8 rise">
      <div>
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Gestión
        </p>
        <h1 className="mb-4 mt-1 text-[27px] text-ink">Editar proveedor</h1>
        <ProveedorForm
          initial={proveedor}
          esAdministrador={esAdmin === true}
          submitLabel="Guardar cambios"
          onSubmit={async (values) => {
            await actualizarProveedor(id, values)
            router.push('/proveedores')
          }}
        />
      </div>
      <div>
        <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Historial de compras
        </p>
        <div className="card divide-y divide-line">
          {facturas.map((f) => (
            <p key={f.id} className="px-5 py-3 text-sm text-ink">
              <span className="mono text-ink-faint">{f.fecha}</span> — {f.tipo_comprobante}{' '}
              {f.numero_comprobante}
              {esAdmin && (
                <>
                  {' '}
                  — <span className="mono font-semibold">${f.total.toLocaleString('es-AR')}</span>
                </>
              )}
            </p>
          ))}
          {facturas.length === 0 && (
            <p className="px-5 py-6 text-sm text-ink-faint">Sin compras aún.</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Correr la suite de tests existente**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Build de producción**

Run: `npm run build`
Expected: build limpio.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/proveedores/ProveedorForm.tsx" "app/(app)/proveedores/nuevo/page.tsx" "app/(app)/proveedores/[id]/page.tsx"
git commit -m "feat: ocultar impuestos de proveedor y montos del historial de compras para empleados"
```

---

### Task 8: Productos — ocultar costo unitario para empleados

**Files:**
- Modify: `app/(app)/productos/page.tsx`
- Modify: `app/(app)/productos/[id]/page.tsx`

**Interfaces:**
- Consumes: `useEsAdministrador()` de `@/lib/hooks/useEsAdministrador` (Task 1).
- Produces: nada que otra task consuma.

- [ ] **Step 1: Ocultar la columna de costo en `app/(app)/productos/page.tsx`**

Agregar el import del hook después de `import type { Producto } from '@/types/database'`:

```ts
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
```

Reemplazar el cuerpo del componente completo:

```tsx
export default function ProductosPage() {
  const esAdmin = useEsAdministrador()
  const [productos, setProductos] = useState<Producto[]>([])
  const [soloStockBajo, setSoloStockBajo] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    listarProductos({ soloStockBajo })
      .then(setProductos)
      .finally(() => setLoading(false))
  }, [soloStockBajo])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="flex items-center justify-between rise">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Gestión
          </p>
          <h1 className="mt-1 text-[27px] text-ink">Productos</h1>
        </div>
        <Link href="/productos/nuevo" className="pill-btn">
          + Nuevo producto
        </Link>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-soft rise">
        <input
          type="checkbox"
          checked={soloStockBajo}
          onChange={(e) => setSoloStockBajo(e.target.checked)}
          className="accent-accent"
        />
        Mostrar solo stock bajo
      </label>
      {loading ? (
        <p className="text-sm text-ink-soft">Cargando…</p>
      ) : (
        <div className="card rise overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  Nombre
                </th>
                <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  Categoría
                </th>
                <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  Stock actual
                </th>
                {esAdmin && (
                  <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Costo unitario
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => (
                <tr key={p.id} className="border-b border-line transition last:border-0 hover:bg-surface-sunk">
                  <td className="px-5 py-3">
                    <Link href={`/productos/${p.id}`} className="font-medium text-ink hover:text-accent">
                      {p.nombre}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-ink-soft">{p.categoria}</td>
                  <td className="px-5 py-3">
                    {p.stock_actual <= p.stock_minimo ? (
                      <span className="chip down">
                        {p.stock_actual} {p.unidad_stock}
                      </span>
                    ) : (
                      <span className="mono text-ink">
                        {p.stock_actual} {p.unidad_stock}
                      </span>
                    )}
                  </td>
                  {esAdmin && (
                    <td className="mono px-5 py-3 text-ink">
                      ${p.costo_unitario_actual.toLocaleString('es-AR')}
                    </td>
                  )}
                </tr>
              ))}
              {productos.length === 0 && (
                <tr>
                  <td colSpan={esAdmin ? 4 : 3} className="px-5 py-6 text-sm text-ink-faint">
                    Sin productos aún.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Ocultar el costo en `app/(app)/productos/[id]/page.tsx`**

Agregar el import del hook después de `import { ProductoForm } from '../ProductoForm'`:

```ts
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
```

Reemplazar el cuerpo del componente completo:

```tsx
export default function EditarProductoPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const esAdmin = useEsAdministrador()
  const [producto, setProducto] = useState<Producto | null>(null)

  useEffect(() => {
    obtenerProducto(id).then(setProducto)
  }, [id])

  if (!producto) return <p className="p-8 text-sm text-ink-soft">Cargando…</p>

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-5 sm:p-8 rise">
      <div>
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Gestión
        </p>
        <h1 className="mt-1 text-[27px] text-ink">Editar producto</h1>
      </div>
      <div className="chip up mb-2 w-fit">
        Stock: {producto.stock_actual} {producto.unidad_stock}
        {esAdmin && ` · Costo: $${producto.costo_unitario_actual.toLocaleString('es-AR')}`}
      </div>
      <ProductoForm
        initial={producto}
        submitLabel="Guardar cambios"
        onSubmit={async (values) => {
          await actualizarProducto(id, values)
          router.push('/productos')
        }}
      />
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Correr la suite de tests existente**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Build de producción**

Run: `npm run build`
Expected: build limpio.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/productos/page.tsx" "app/(app)/productos/[id]/page.tsx"
git commit -m "feat: ocultar costo unitario de productos para empleados"
```

---

### Task 9: Stock — ocultar valor de stock y agregar historial de movimientos

**Files:**
- Create: `lib/data/movimientos.ts`
- Modify: `app/(app)/stock/page.tsx` (reemplazo completo — 145 líneas actuales)

**Interfaces:**
- Consumes: `useEsAdministrador()` de `@/lib/hooks/useEsAdministrador` (Task 1); tipo `MovimientoStock` de `@/types/database` (ya existe).
- Produces: `listarMovimientosStock(limite?: number): Promise<MovimientoStock[]>` desde `@/lib/data/movimientos`. Ninguna task posterior lo consume.

- [ ] **Step 1: Crear `lib/data/movimientos.ts`**

```ts
import { createClient } from '@/lib/supabase/client'
import type { MovimientoStock } from '@/types/database'

export async function listarMovimientosStock(limite = 50): Promise<MovimientoStock[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('movimientos_stock')
    .select('*')
    .order('fecha', { ascending: false })
    .limit(limite)
  if (error) throw error
  return data as MovimientoStock[]
}
```

- [ ] **Step 2: Reemplazar `app/(app)/stock/page.tsx` completo**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { listarProductos } from '@/lib/data/productos'
import { ajustarStockManual } from '@/lib/data/stock'
import { listarMovimientosStock } from '@/lib/data/movimientos'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import type { Producto, MovimientoStock } from '@/types/database'

const ETIQUETA_TIPO: Record<MovimientoStock['tipo'], string> = {
  entrada_compra: 'Entrada por compra',
  ajuste_manual: 'Ajuste manual',
}

export default function StockPage() {
  const esAdmin = useEsAdministrador()
  const [productos, setProductos] = useState<Producto[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoStock[]>([])
  const [ajusteAbierto, setAjusteAbierto] = useState<string | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)

  function cargar() {
    listarProductos().then(setProductos)
    listarMovimientosStock().then(setMovimientos)
  }

  useEffect(cargar, [])

  async function handleAjustar(productoId: string) {
    setError(null)
    if (!motivo.trim()) return setError('El motivo es obligatorio.')
    if (!cantidad || Number(cantidad) === 0) return setError('Ingresá una cantidad distinta de 0.')
    try {
      await ajustarStockManual(productoId, Number(cantidad), motivo.trim())
      setAjusteAbierto(null)
      setCantidad('')
      setMotivo('')
      cargar()
    } catch (err) {
      setError('No se pudo ajustar el stock. Intentá de nuevo.')
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="rise">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Gestión
        </p>
        <h1 className="mt-1 text-[27px] text-ink">Stock</h1>
      </div>
      <div className="card rise overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                Producto
              </th>
              <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                Stock actual
              </th>
              <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                Stock mínimo
              </th>
              {esAdmin && (
                <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  Valor (costo × stock)
                </th>
              )}
              <th />
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => {
              const bajo = p.stock_actual <= p.stock_minimo
              const columnas = esAdmin ? 5 : 4
              return (
                <>
                  <tr key={p.id} className="border-b border-line transition last:border-0 hover:bg-surface-sunk">
                    <td className="px-5 py-3 text-ink">{p.nombre}</td>
                    <td className="px-5 py-3">
                      {bajo ? (
                        <span className="chip down">
                          {p.stock_actual} {p.unidad_stock}
                        </span>
                      ) : (
                        <span className="mono text-ink">
                          {p.stock_actual} {p.unidad_stock}
                        </span>
                      )}
                    </td>
                    <td className="mono px-5 py-3 text-ink-soft">{p.stock_minimo}</td>
                    {esAdmin && (
                      <td className="mono px-5 py-3 text-ink">
                        ${(p.stock_actual * p.costo_unitario_actual).toLocaleString('es-AR')}
                      </td>
                    )}
                    <td className="px-5 py-3">
                      <button
                        onClick={() => {
                          setAjusteAbierto(ajusteAbierto === p.id ? null : p.id)
                          setCantidad('')
                          setMotivo('')
                          setError(null)
                        }}
                        className="text-xs font-semibold text-accent hover:underline"
                      >
                        Ajustar
                      </button>
                    </td>
                  </tr>
                  {ajusteAbierto === p.id && (
                    <tr className="border-b border-line bg-surface-sunk">
                      <td colSpan={columnas} className="px-5 py-4">
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="text-sm text-ink-soft">
                            Cantidad (+/- en {p.unidad_stock})
                            <input
                              type="number"
                              step="any"
                              value={cantidad}
                              onChange={(e) => setCantidad(e.target.value)}
                              className="mt-1 block w-32 rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none focus:border-accent"
                            />
                          </label>
                          <label className="text-sm text-ink-soft">
                            Motivo
                            <input
                              value={motivo}
                              onChange={(e) => setMotivo(e.target.value)}
                              className="mt-1 block w-64 rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none focus:border-accent"
                            />
                          </label>
                          <button onClick={() => handleAjustar(p.id)} className="pill-btn">
                            Confirmar
                          </button>
                        </div>
                        {error && <p className="mt-2 text-sm text-negative">{error}</p>}
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
            {productos.length === 0 && (
              <tr>
                <td colSpan={esAdmin ? 5 : 4} className="px-5 py-6 text-sm text-ink-faint">
                  Sin productos aún.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="shell rise">
        <div className="core">
          <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Historial de movimientos
          </p>
          <ul className="divide-y divide-line">
            {movimientos.map((m) => {
              const producto = productos.find((p) => p.id === m.producto_id)
              return (
                <li key={m.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-ink">
                    <span className="mono text-ink-faint">{m.fecha}</span> — {producto?.nombre ?? '—'} —{' '}
                    {ETIQUETA_TIPO[m.tipo]}
                    {m.motivo && <span className="text-ink-faint"> ({m.motivo})</span>}
                  </span>
                  <span className={`chip ${m.cantidad >= 0 ? 'up' : 'down'}`}>
                    {m.cantidad >= 0 ? '+' : ''}
                    {m.cantidad}
                  </span>
                </li>
              )
            })}
            {movimientos.length === 0 && (
              <li className="py-2.5 text-sm text-ink-faint">Sin movimientos aún.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Correr la suite de tests existente**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Build de producción**

Run: `npm run build`
Expected: build limpio.

- [ ] **Step 6: Commit**

```bash
git add lib/data/movimientos.ts "app/(app)/stock/page.tsx"
git commit -m "feat: ocultar valor de stock para empleados y agregar historial de movimientos"
```

---

### Task 10: Compras — ocultar montos y restringir carga de facturas a admin

**Files:**
- Modify: `app/(app)/compras/page.tsx`
- Modify: `app/(app)/compras/[id]/page.tsx`
- Modify: `app/(app)/compras/nueva/page.tsx:1-10,32-40` (edición puntual, no reemplazo completo — el archivo tiene 339 líneas)

**Interfaces:**
- Consumes: `useEsAdministrador()` de `@/lib/hooks/useEsAdministrador` (Task 1).
- Produces: nada que otra task consuma — es la task final de este plan.

- [ ] **Step 1: Ocultar montos y el link "+ Nueva factura" en `app/(app)/compras/page.tsx`**

Agregar el import del hook después de `import type { FacturaCompra, Proveedor } from '@/types/database'`:

```ts
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
```

Reemplazar el cuerpo del componente completo:

```tsx
export default function ComprasPage() {
  const esAdmin = useEsAdministrador()
  const [facturas, setFacturas] = useState<FacturaCompra[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [proveedorId, setProveedorId] = useState('')

  useEffect(() => {
    listarProveedores().then(setProveedores)
  }, [])

  useEffect(() => {
    listarFacturas({ proveedorId: proveedorId || undefined }).then(setFacturas)
  }, [proveedorId])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="flex items-center justify-between rise">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Gestión
          </p>
          <h1 className="mt-1 text-[27px] text-ink">Compras</h1>
        </div>
        {esAdmin && (
          <Link href="/compras/nueva" className="pill-btn">
            + Nueva factura
          </Link>
        )}
      </div>
      <select
        value={proveedorId}
        onChange={(e) => setProveedorId(e.target.value)}
        className="rise w-fit rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
      >
        <option value="">Todos los proveedores</option>
        {proveedores.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </select>
      <div className="card rise divide-y divide-line">
        {facturas.map((f) => {
          const proveedor = proveedores.find((p) => p.id === f.proveedor_id)
          return (
            <Link
              key={f.id}
              href={`/compras/${f.id}`}
              className="flex items-center justify-between px-5 py-3.5 text-sm transition hover:bg-surface-sunk"
            >
              <span className="text-ink">
                <span className="mono text-ink-faint">{f.fecha}</span> — {proveedor?.nombre ?? '—'} —{' '}
                {f.tipo_comprobante} {f.numero_comprobante}
                {f.estado === 'anulada' && <span className="chip down ml-2">ANULADA</span>}
              </span>
              {esAdmin && (
                <span className="mono font-semibold text-ink">${f.total.toLocaleString('es-AR')}</span>
              )}
            </Link>
          )
        })}
        {facturas.length === 0 && (
          <p className="px-5 py-6 text-sm text-ink-faint">Sin facturas aún.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Ocultar montos en `app/(app)/compras/[id]/page.tsx`**

Agregar el import del hook después de `import type { FacturaCompra, ItemFactura, Proveedor, Producto } from '@/types/database'`:

```ts
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
```

Reemplazar el cuerpo del componente completo:

```tsx
export default function DetalleFacturaPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const esAdmin = useEsAdministrador()
  const [factura, setFactura] = useState<FacturaCompra | null>(null)
  const [items, setItems] = useState<ItemFactura[]>([])
  const [proveedor, setProveedor] = useState<Proveedor | null>(null)
  const [productos, setProductos] = useState<Producto[]>([])
  const [anulando, setAnulando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    obtenerFacturaConItems(id).then(({ factura, items }) => {
      setFactura(factura)
      setItems(items)
      obtenerProveedor(factura.proveedor_id).then(setProveedor)
    })
    listarProductos().then(setProductos)
  }, [id])

  if (!factura) return <p className="p-8 text-sm text-ink-soft">Cargando…</p>

  async function handleAnular() {
    if (!confirm('¿Anular esta factura? Se revertirá el stock que sumó.')) return
    setError(null)
    setAnulando(true)
    try {
      await anularFactura(id)
      router.refresh()
      const { factura: actualizada } = await obtenerFacturaConItems(id)
      setFactura(actualizada)
    } catch (err) {
      setError('No se pudo anular la factura. Intentá de nuevo.')
    } finally {
      setAnulando(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-5 sm:p-8">
      <div className="rise">
        <h1 className="flex items-center gap-2 text-[27px] text-ink">
          {factura.tipo_comprobante} {factura.numero_comprobante}
          {factura.estado === 'anulada' && <span className="chip down">ANULADA</span>}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {proveedor?.nombre} — <span className="mono">{factura.fecha}</span>
        </p>
      </div>

      <div className="card rise overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                Producto
              </th>
              <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                Cantidad
              </th>
              {esAdmin && (
                <>
                  <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Costo neto
                  </th>
                  <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Costo real (con imp.)
                  </th>
                  <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Subtotal
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const costoReal = proveedor
                ? calcularCostoRealUnitario(item.costo_unitario, item.alicuota_iva, {
                    aplicaIibb: proveedor.aplica_iibb,
                    tasaIibb: proveedor.tasa_iibb,
                    aplicaPercIva: proveedor.aplica_perc_iva,
                    tasaPercIva: proveedor.tasa_perc_iva,
                    descuentoProntoPago: proveedor.descuento_pronto_pago,
                  })
                : null
              return (
                <tr key={item.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 text-ink">
                    {productos.find((p) => p.id === item.producto_id)?.nombre}
                  </td>
                  <td className="mono px-5 py-3 text-ink">{item.cantidad}</td>
                  {esAdmin && (
                    <>
                      <td className="mono px-5 py-3 text-ink-soft">
                        ${item.costo_unitario.toLocaleString('es-AR')}
                      </td>
                      <td className="mono px-5 py-3 font-semibold text-ink">
                        {costoReal !== null ? `$${costoReal.toLocaleString('es-AR')}` : '—'}
                      </td>
                      <td className="mono px-5 py-3 text-ink">${item.subtotal.toLocaleString('es-AR')}</td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {esAdmin &&
        proveedor &&
        (proveedor.aplica_iibb || proveedor.aplica_perc_iva || proveedor.descuento_pronto_pago > 0) && (
          <p className="text-xs text-ink-faint rise">
            Costo real = costo neto × (1 + IVA
            {proveedor.aplica_iibb && ` + II.BB. ${proveedor.tasa_iibb}%`}
            {proveedor.aplica_perc_iva && ` + Perc. IVA ${proveedor.tasa_perc_iva}%`}) ×{' '}
            {proveedor.descuento_pronto_pago > 0
              ? `(1 − ${proveedor.descuento_pronto_pago}% dto. pronto pago)`
              : '1'}{' '}
            — configurado en la ficha de {proveedor.nombre}.
          </p>
        )}

      {esAdmin && (
        <div className="shell ml-auto w-72 rise">
          <div className="core flex flex-col gap-2 text-sm">
            <div className="flex justify-between text-ink-soft">
              <span>Subtotal</span>
              <span className="mono">${factura.subtotal.toLocaleString('es-AR')}</span>
            </div>
            <div className="flex justify-between text-ink-soft">
              <span>IVA</span>
              <span className="mono">${factura.iva_total.toLocaleString('es-AR')}</span>
            </div>
            <div className="flex justify-between border-t border-line pt-2 font-semibold text-ink">
              <span>Total</span>
              <span className="mono">${factura.total.toLocaleString('es-AR')}</span>
            </div>
          </div>
        </div>
      )}

      {factura.estado === 'cargada' && (
        <div className="rise">
          <button
            onClick={handleAnular}
            disabled={anulando}
            className="pill-btn ghost !text-negative disabled:opacity-50"
          >
            {anulando ? 'Anulando…' : 'Anular factura'}
          </button>
          {error && <p className="mt-2 text-sm text-negative">{error}</p>}
        </div>
      )}
    </div>
  )
}
```

Nota: "Anular factura" queda fuera de cualquier chequeo de `esAdmin` — sigue disponible para ambos roles, según la spec.

- [ ] **Step 3: Restringir `app/(app)/compras/nueva/page.tsx` a administradores**

En ese archivo, agregar el import del hook después de `import type { Proveedor, Producto, TipoComprobante } from '@/types/database'` (línea 10 actual):

```ts
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
```

Y dentro de `NuevaFacturaPage` (que empieza en la línea 32 actual), agregar el chequeo de rol como primera línea del cuerpo de la función, antes de `const router = useRouter()`:

```tsx
export default function NuevaFacturaPage() {
  const esAdmin = useEsAdministrador()
  const router = useRouter()
```

Y, sin tocar el resto del cuerpo del componente (todos los `useState`, `useEffect`, y funciones que ya existen entre la línea 33 y el `return` final), agregar estos dos early-returns inmediatamente antes del `return (` que empieza el JSX de la página (buscar el primer `return (` del componente, después de toda la lógica de estado/efectos ya existente):

```tsx
  if (esAdmin === null) return <p className="p-8 text-sm text-ink-soft">Cargando…</p>
  if (esAdmin === false) {
    return (
      <p className="p-8 text-sm text-negative">
        Acceso restringido — contactá a un administrador.
      </p>
    )
  }

  return (
    // ... el JSX existente del formulario, sin cambios
```

No se modifica ningún otro fragmento de este archivo — todos los `useState`/`useEffect`/funciones internas (carga de proveedores/productos, cálculo de totales, envío del formulario) quedan exactamente como están.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Correr la suite de tests existente**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Build de producción**

Run: `npm run build`
Expected: build limpio; todas las rutas de este plan (`/usuarios`, `/api/usuarios`, más las ya existentes) generan sin errores.

- [ ] **Step 7: Verificación manual en el navegador**

Sin credenciales de test disponibles en este entorno — releé el JSX con cuidado y reportá esa limitación. La verificación real (crear un usuario de prueba con rol empleado y confirmar que no ve ningún monto en ningún lado, y que el administrador puede invitar gente y cambiar roles) la hace el usuario después de correr la migración `0007_roles.sql` y configurar `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/compras/page.tsx" "app/(app)/compras/[id]/page.tsx" "app/(app)/compras/nueva/page.tsx"
git commit -m "feat: ocultar montos de compras y restringir carga de facturas a administradores"
```

---

## Self-Review

**1. Cobertura del spec:**
- Parte 1 (columna `rol`, default `empleado`, promoción del único usuario existente) → Task 1. ✅
- Parte 2 (cliente admin, API de servidor con verificación de rol, invitación por email, pantalla `/usuarios`, nadie cambia su propio rol) → Tasks 2 y 3. ✅
- Parte 3, tabla completa (dashboard, proveedores, productos, compras, stock, reportes, usuarios) → Tasks 4-8, 10. Además se cubrió un punto no explícito en la tabla pero exigido por el principio general de la spec ("el empleado nunca ve un monto de dinero en ningún lado"): el historial de compras dentro de la ficha de un proveedor, cubierto en Task 7. ✅
- Parte 4 (historial de movimientos de stock, visible a ambos roles) → Task 9. ✅
- "Fuera de alcance" (tercer rol, recepción física independiente de la factura, RLS por columna, auto-cambio de rol) → ninguna task los implementa; el auto-cambio de rol está bloqueado explícitamente en Tasks 2 y 3. ✅

**2. Placeholders:** ninguno — todo el código de cada task es el código real a escribir, completo.

**3. Consistencia de tipos:**
- `RolPerfil = 'administrador' | 'empleado'` — definido en Task 1, usado idéntico (mismos dos valores, mismos nombres) en Tasks 2, 3, 4, 5, 6, 7, 8, 9, 10.
- `useEsAdministrador(): boolean | null` — definido en Task 1, consumido exactamente así (con los 3 estados `null`/`true`/`false` respetados en cada `if`) en Tasks 6, 7, 8, 9, 10.
- `ProveedorForm` gana `esAdministrador: boolean` en Task 7 — ambos callers (`nuevo/page.tsx`, `[id]/page.tsx`) lo pasan en la misma task, ningún caller queda desactualizado.
- `listarMovimientosStock(limite?: number): Promise<MovimientoStock[]>` — definido y consumido dentro de la misma Task 9, mismo archivo de tipos (`MovimientoStock` ya existente, sin cambios).
- `UsuarioConEmail { id, email, nombre, rol }` — definido en Task 3, consumido en la misma task (no hay otra task que lo use).
- El `id` de usuario en `PATCH /api/usuarios` (Task 2) y el `perfilActual.id` usado para deshabilitar el propio cambio de rol en la UI (Task 3) son ambos el `id` de Supabase Auth (`auth.uid()`), consistentes entre servidor y cliente.
