# Comparador y proveedores abiertos a empleados — Plan de implementación

> **Para quien ejecute:** usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para seguir este plan tarea por tarea. Los pasos usan casillas `- [ ]`.

**Objetivo:** que los empleados puedan ver el comparador, cargar precios (a mano o importando CSV/PDF) y crear/editar proveedores, con un registro automático de quién hizo cada cambio.

**Arquitectura:** se abren las rutas y las políticas RLS necesarias; un trigger protege los datos fiscales del proveedor; dos triggers de auditoría llenan la tabla `registro_cambios`; la pantalla de cada proveedor muestra el historial.

**Tecnología:** Next.js 16 (App Router), React, TypeScript, Supabase (Postgres + RLS + triggers), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-22-comparador-empleados-design.md`

## Restricciones globales

- Textos de la interfaz en español rioplatense, como el resto de la app.
- Empleado: ve el comparador; inserta/actualiza `precios_proveedor`; crea/edita `proveedores`. No borra precios ni proveedores. No cambia IIBB, percepción de IVA ni descuento por pronto pago.
- `requerirAdministrador` no se modifica.
- El acceso de Claude a Supabase es de **solo lectura** (`.mcp.json`, `read_only=true`): la migración la pega la persona dueña en el SQL Editor y se verifica después con `select`.
- `AGENTS.md`: esta versión de Next.js tiene cambios incompatibles; solo se usan patrones que ya existen en el repo (rutas `route.ts`, componentes `'use client'`).
- Antes de afirmar que algo funciona: `npm run typecheck`, `npm run lint` y `npm test`.
- Commits en español, terminados con `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Solo se hace commit y push cuando la persona dueña lo pide.
- Un hook de seguridad (GateGuard) exige, la primera vez que se edita o crea cada archivo, enumerar quién lo importa, qué API cambia y citar el pedido del usuario. Hay que hacerlo antes de cada primer edit.

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `lib/auth/requerirSesion.ts` | crear | Exigir solo sesión iniciada en rutas de API |
| `lib/auth/requerirSesion.test.ts` | crear | Pruebas de `requerirSesion` |
| `app/api/comparador/leer-pdf/route.ts` | modificar | Usar `requerirSesion` |
| `components/Sidebar.tsx` | modificar | Mostrar Comparador a empleados |
| `app/(app)/comparador/importar/page.tsx` | modificar | Quitar el bloqueo de no administradores |
| `types/database.ts` | modificar | Tipo `RegistroCambio` y tabla `registro_cambios` |
| `lib/registro/describirCambio.ts` | crear | Convertir un registro en una frase legible |
| `lib/registro/describirCambio.test.ts` | crear | Pruebas de la frase |
| `lib/data/registroCambios.ts` | crear | Leer el historial de un proveedor |
| `app/(app)/proveedores/HistorialCambios.tsx` | crear | Mostrar el historial |
| `app/(app)/proveedores/[id]/page.tsx` | modificar | Incluir el historial |
| `supabase/migrations/0035_comparador_empleados_y_registro.sql` | crear | Políticas, triggers y tabla de auditoría |
| `docs/ARQUITECTURA.md` | modificar | Documentar permisos y registro de cambios |

---

### Tarea 1: `requerirSesion` y lectura de PDF para empleados

**Archivos:**
- Crear: `lib/auth/requerirSesion.ts`
- Crear: `lib/auth/requerirSesion.test.ts`
- Modificar: `app/api/comparador/leer-pdf/route.ts:2,9-10`

**Interfaces:**
- Produce: `requerirSesion(): Promise<{ error: NextResponse; user?: undefined } | { error?: undefined; user: { id: string } }>`

- [ ] **Paso 1: escribir la prueba que falla**

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))

import { requerirSesion } from './requerirSesion'

describe('requerirSesion', () => {
  beforeEach(() => getUser.mockReset())

  it('rechaza con 401 si no hay sesión', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const resultado = await requerirSesion()
    expect(resultado.error?.status).toBe(401)
    expect(resultado.user).toBeUndefined()
  })

  it('devuelve el usuario si hay sesión, sin mirar el rol', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const resultado = await requerirSesion()
    expect(resultado.error).toBeUndefined()
    expect(resultado.user).toEqual({ id: 'u1' })
  })
})
```

- [ ] **Paso 2: correrla y ver que falla**

Ejecutar: `npx vitest run lib/auth/requerirSesion.test.ts`
Esperado: FALLA con "Failed to resolve import './requerirSesion'".

- [ ] **Paso 3: implementación mínima**

```ts
// lib/auth/requerirSesion.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type ResultadoSesion =
  | { error: NextResponse; user?: undefined }
  | { error?: undefined; user: { id: string } }

/** Exige solo una sesión iniciada (empleado o administrador). */
export async function requerirSesion(): Promise<ResultadoSesion> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  }
  return { user }
}
```

- [ ] **Paso 4: correr la prueba y ver que pasa**

Ejecutar: `npx vitest run lib/auth/requerirSesion.test.ts`
Esperado: 2 pruebas PASAN.

- [ ] **Paso 5: usarla en la ruta de PDF**

En `app/api/comparador/leer-pdf/route.ts`, reemplazar la importación y el uso:

```ts
import { requerirSesion } from '@/lib/auth/requerirSesion'
```
(en lugar de `requerirAdministrador`) y dentro de `POST`:

```ts
  const { error } = await requerirSesion()
  if (error) return error
```

- [ ] **Paso 6: verificar y commit**

Ejecutar: `npm run typecheck && npm run lint && npm test`
Esperado: sin errores.

```bash
git add lib/auth/requerirSesion.ts lib/auth/requerirSesion.test.ts app/api/comparador/leer-pdf/route.ts
git commit -m "feat: la lectura de PDF del comparador pide solo sesión iniciada"
```

---

### Tarea 2: Mostrar el Comparador a empleados

**Archivos:**
- Modificar: `components/Sidebar.tsx:101`
- Modificar: `app/(app)/comparador/importar/page.tsx:15,51,141-147`

- [ ] **Paso 1: quitar `soloAdmin` del Comparador**

En `components/Sidebar.tsx`, cambiar la línea 101 por:

```tsx
      { href: '/comparador', label: 'Comparador', Icono: IconComparador },
```

- [ ] **Paso 2: quitar el bloqueo de la pantalla de importar**

En `app/(app)/comparador/importar/page.tsx`:
1. Borrar la importación `import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'` (línea 15).
2. Borrar `const esAdmin = useEsAdministrador()` (línea 51).
3. Borrar estas líneas (141-147):

```tsx
  if (esAdmin === null) return <p className="p-8 text-sm text-ink-soft">Cargando…</p>
  if (esAdmin === false) {
    return (
      <p className="p-8 text-sm text-negative">
        Acceso restringido — contactá a un administrador.
      </p>
    )
  }
```

- [ ] **Paso 3: verificar**

Ejecutar: `npm run typecheck && npm run lint`
Esperado: sin errores ni importaciones sin usar.

- [ ] **Paso 4: commit**

```bash
git add components/Sidebar.tsx "app/(app)/comparador/importar/page.tsx"
git commit -m "feat: el comparador y la importación de listas quedan visibles para empleados"
```

---

### Tarea 3: Tipo, frase legible y lectura del historial

**Archivos:**
- Modificar: `types/database.ts` (agregar tipo y entrada en `Database.public.Tables`, después de la línea 256 del bloque `precios_proveedor`)
- Crear: `lib/registro/describirCambio.ts`
- Crear: `lib/registro/describirCambio.test.ts`
- Crear: `lib/data/registroCambios.ts`

**Interfaces:**
- Produce: `RegistroCambio`, `describirCambio(r: RegistroCambio): string`, `listarCambiosProveedor(proveedorId: string, limite?: number): Promise<RegistroCambio[]>`

- [ ] **Paso 1: agregar el tipo**

En `types/database.ts`, junto a `PrecioProveedor`:

```ts
export type TablaRegistrada = 'proveedores' | 'precios_proveedor'

export interface RegistroCambio {
  id: string
  creado_en: string
  usuario_id: string | null
  usuario_nombre: string
  tabla: TablaRegistrada
  registro_id: string
  operacion: 'insert' | 'update' | 'delete'
  proveedor_id: string | null
  detalle: Record<string, unknown>
}
```

Y dentro de `Database.public.Tables`:

```ts
      registro_cambios: {
        Row: RegistroCambio
        Insert: Partial<RegistroCambio>
        Update: Partial<RegistroCambio>
      }
```

- [ ] **Paso 2: escribir las pruebas que fallan**

```ts
// lib/registro/describirCambio.test.ts
import { describe, expect, it } from 'vitest'
import type { RegistroCambio } from '@/types/database'
import { describirCambio } from './describirCambio'

const base: RegistroCambio = {
  id: '1',
  creado_en: '2026-10-22T16:00:00Z',
  usuario_id: 'u1',
  usuario_nombre: 'Nacho',
  tabla: 'precios_proveedor',
  registro_id: 'r1',
  operacion: 'update',
  proveedor_id: 'p1',
  detalle: {},
}

describe('describirCambio', () => {
  it('precio cargado por primera vez', () => {
    const r = { ...base, operacion: 'insert' as const, detalle: { producto: 'Abbocath N°14', precio_anterior: null, precio_nuevo: 1200 } }
    expect(describirCambio(r)).toBe('Cargó el precio de Abbocath N°14: $1.200')
  })

  it('precio modificado', () => {
    const r = { ...base, detalle: { producto: 'Abbocath N°14', precio_anterior: 1200, precio_nuevo: 1350 } }
    expect(describirCambio(r)).toBe('Cambió el precio de Abbocath N°14: $1.200 → $1.350')
  })

  it('precio borrado, con producto desconocido', () => {
    const r = { ...base, operacion: 'delete' as const, detalle: { producto: null, precio_anterior: 500, precio_nuevo: null } }
    expect(describirCambio(r)).toBe('Borró el precio de un producto ($500)')
  })

  it('proveedor creado y borrado', () => {
    const creado = { ...base, tabla: 'proveedores' as const, operacion: 'insert' as const, detalle: { nombre: 'Distribuidora Sur' } }
    const borrado = { ...creado, operacion: 'delete' as const }
    expect(describirCambio(creado)).toBe('Creó el proveedor Distribuidora Sur')
    expect(describirCambio(borrado)).toBe('Borró el proveedor Distribuidora Sur')
  })

  it('proveedor editado: nombra los campos con su etiqueta y formatea los valores', () => {
    const r = {
      ...base,
      tabla: 'proveedores' as const,
      detalle: {
        telefono: { antes: null, despues: '11 5555-1234' },
        activo: { antes: true, despues: false },
      },
    }
    expect(describirCambio(r)).toBe('Editó: Teléfono (— → 11 5555-1234), Activo (Sí → No)')
  })
})
```

- [ ] **Paso 3: correrlas y ver que fallan**

Ejecutar: `npx vitest run lib/registro/describirCambio.test.ts`
Esperado: FALLA con "Failed to resolve import './describirCambio'".

- [ ] **Paso 4: implementación**

```ts
// lib/registro/describirCambio.ts
import type { RegistroCambio } from '@/types/database'

const ETIQUETAS: Record<string, string> = {
  nombre: 'Nombre',
  razon_social: 'Razón social',
  cuit: 'CUIT',
  telefono: 'Teléfono',
  email: 'Email',
  direccion: 'Dirección',
  notas: 'Notas',
  alias: 'Alias',
  tipos_comprobante: 'Tipos de comprobante',
  condicion_pago_habitual: 'Condición de pago',
  formato_habitual: 'Formato habitual',
  aplica_iibb: 'Aplica IIBB',
  tasa_iibb: 'Tasa IIBB',
  aplica_perc_iva: 'Aplica percepción IVA',
  tasa_perc_iva: 'Tasa percepción IVA',
  descuento_pronto_pago: 'Descuento pronto pago',
  activo: 'Activo',
}

function dinero(valor: unknown): string {
  return typeof valor === 'number' ? `$${valor.toLocaleString('es-AR')}` : '—'
}

function valorLegible(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No'
  if (Array.isArray(valor)) return valor.length === 0 ? '—' : valor.join(', ')
  return String(valor)
}

export function describirCambio(r: RegistroCambio): string {
  const d = r.detalle
  if (r.tabla === 'precios_proveedor') {
    const producto = typeof d.producto === 'string' && d.producto ? d.producto : 'un producto'
    if (r.operacion === 'insert') return `Cargó el precio de ${producto}: ${dinero(d.precio_nuevo)}`
    if (r.operacion === 'delete') return `Borró el precio de ${producto} (${dinero(d.precio_anterior)})`
    return `Cambió el precio de ${producto}: ${dinero(d.precio_anterior)} → ${dinero(d.precio_nuevo)}`
  }
  const nombre = typeof d.nombre === 'string' ? d.nombre : ''
  if (r.operacion === 'insert') return `Creó el proveedor ${nombre}`.trim()
  if (r.operacion === 'delete') return `Borró el proveedor ${nombre}`.trim()
  const cambios = Object.entries(d).map(([campo, valor]) => {
    const { antes, despues } = valor as { antes: unknown; despues: unknown }
    return `${ETIQUETAS[campo] ?? campo} (${valorLegible(antes)} → ${valorLegible(despues)})`
  })
  return `Editó: ${cambios.join(', ')}`
}
```

- [ ] **Paso 5: correrlas y ver que pasan**

Ejecutar: `npx vitest run lib/registro/describirCambio.test.ts`
Esperado: 5 pruebas PASAN.

- [ ] **Paso 6: la lectura del historial**

```ts
// lib/data/registroCambios.ts
import { createClient } from '@/lib/supabase/client'
import type { RegistroCambio } from '@/types/database'

export async function listarCambiosProveedor(proveedorId: string, limite = 30): Promise<RegistroCambio[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('registro_cambios')
    .select('*')
    .eq('proveedor_id', proveedorId)
    .order('creado_en', { ascending: false })
    .limit(limite)
  if (error) throw error
  return data as RegistroCambio[]
}
```

- [ ] **Paso 7: verificar y commit**

Ejecutar: `npm run typecheck && npm run lint && npm test`
Esperado: sin errores.

```bash
git add types/database.ts lib/registro lib/data/registroCambios.ts
git commit -m "feat: tipo, frases legibles y lectura del registro de cambios de proveedores"
```

---

### Tarea 4: Historial en la pantalla del proveedor

**Archivos:**
- Crear: `app/(app)/proveedores/HistorialCambios.tsx`
- Modificar: `app/(app)/proveedores/[id]/page.tsx:5-9,62-63`

**Interfaces:**
- Consume: `listarCambiosProveedor`, `describirCambio` (Tarea 3)
- Produce: `<HistorialCambios proveedorId={string} />`

- [ ] **Paso 1: el componente**

```tsx
// app/(app)/proveedores/HistorialCambios.tsx
'use client'

import { useEffect, useState } from 'react'
import { listarCambiosProveedor } from '@/lib/data/registroCambios'
import { describirCambio } from '@/lib/registro/describirCambio'
import type { RegistroCambio } from '@/types/database'

export function HistorialCambios({ proveedorId }: { proveedorId: string }) {
  const [cambios, setCambios] = useState<RegistroCambio[] | null>(null)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    listarCambiosProveedor(proveedorId)
      .then(setCambios)
      .catch(() => setFallo(true))
  }, [proveedorId])

  return (
    <div>
      <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        Historial de cambios
      </p>
      <div className="card divide-y divide-line">
        {cambios?.map((c) => (
          <p key={c.id} className="px-5 py-3 text-sm text-ink">
            <span className="mono text-ink-faint">
              {new Date(c.creado_en).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
            </span>{' '}
            — <span className="font-semibold">{c.usuario_nombre}</span>: {describirCambio(c)}
          </p>
        ))}
        {cambios?.length === 0 && <p className="px-5 py-6 text-sm text-ink-faint">Sin cambios registrados.</p>}
        {cambios === null && !fallo && <p className="px-5 py-6 text-sm text-ink-faint">Cargando…</p>}
        {fallo && <p className="px-5 py-6 text-sm text-ink-faint">No se pudo cargar el historial.</p>}
      </div>
    </div>
  )
}
```

- [ ] **Paso 2: incluirlo en la página**

En `app/(app)/proveedores/[id]/page.tsx`, agregar la importación junto a las otras:

```tsx
import { HistorialCambios } from '../HistorialCambios'
```

y, justo después del bloque `Historial de compras` (después del `</div>` que cierra esa sección, antes del `</div>` final de la página):

```tsx
      <HistorialCambios proveedorId={id} />
```

- [ ] **Paso 3: verificar**

Ejecutar: `npm run typecheck && npm run lint`
Esperado: sin errores. (Antes de aplicar la migración, la sección muestra "No se pudo cargar el historial": es el comportamiento esperado y la página no se rompe.)

- [ ] **Paso 4: commit**

```bash
git add "app/(app)/proveedores/HistorialCambios.tsx" "app/(app)/proveedores/[id]/page.tsx"
git commit -m "feat: historial de cambios en la pantalla de cada proveedor"
```

---

### Tarea 5: Migración 0035 (políticas, protección fiscal y auditoría)

**Archivos:**
- Crear: `supabase/migrations/0035_comparador_empleados_y_registro.sql`

- [ ] **Paso 1: escribir la migración**

```sql
-- Comparador y proveedores abiertos a empleados, con registro de quién hizo qué.
-- Spec: docs/superpowers/specs/2026-10-22-comparador-empleados-design.md

-- 1. Políticas: empleados insertan/actualizan precios y crean/editan proveedores.
--    Borrar sigue siendo solo de administradores (políticas *_borrar_admin, sin cambios).
drop policy if exists "precios_proveedor_insertar_admin" on public.precios_proveedor;
drop policy if exists "precios_proveedor_actualizar_admin" on public.precios_proveedor;
create policy "precios_proveedor_insertar" on public.precios_proveedor
  for insert to authenticated with check (true);
create policy "precios_proveedor_actualizar" on public.precios_proveedor
  for update to authenticated using (true) with check (true);

drop policy if exists "proveedores_insertar_admin" on public.proveedores;
drop policy if exists "proveedores_actualizar_admin" on public.proveedores;
create policy "proveedores_insertar" on public.proveedores
  for insert to authenticated with check (true);
create policy "proveedores_actualizar" on public.proveedores
  for update to authenticated using (true) with check (true);

-- 2. Datos fiscales del proveedor: solo un administrador puede cambiarlos.
--    En un alta hecha por un empleado quedan en sus valores por defecto.
create or replace function public.proteger_datos_fiscales_proveedor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new; -- operación del sistema, sin usuario
  end if;
  if exists (select 1 from public.perfiles where id = auth.uid() and rol = 'administrador') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.aplica_iibb := false;
    new.tasa_iibb := 4;
    new.aplica_perc_iva := false;
    new.tasa_perc_iva := 3;
    new.descuento_pronto_pago := 0;
  elsif (new.aplica_iibb, new.tasa_iibb, new.aplica_perc_iva, new.tasa_perc_iva, new.descuento_pronto_pago)
        is distinct from
        (old.aplica_iibb, old.tasa_iibb, old.aplica_perc_iva, old.tasa_perc_iva, old.descuento_pronto_pago) then
    raise exception 'Solo un administrador puede cambiar los datos fiscales del proveedor';
  end if;
  return new;
end
$$;

create trigger proveedores_proteger_fiscales
  before insert or update on public.proveedores
  for each row execute function public.proteger_datos_fiscales_proveedor();

-- 3. Registro de cambios: solo lo escriben los triggers; lo lee cualquier usuario con sesión.
create table public.registro_cambios (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  usuario_id uuid references auth.users (id) on delete set null,
  usuario_nombre text not null,
  tabla text not null check (tabla in ('proveedores', 'precios_proveedor')),
  registro_id uuid not null,
  operacion text not null check (operacion in ('insert', 'update', 'delete')),
  proveedor_id uuid, -- sin FK a propósito: el historial sobrevive si se borra el proveedor
  detalle jsonb not null default '{}'::jsonb
);

create index registro_cambios_proveedor_idx on public.registro_cambios (proveedor_id, creado_en desc);

alter table public.registro_cambios enable row level security;
create policy "registro_cambios_lectura" on public.registro_cambios
  for select to authenticated using (true);
revoke all on public.registro_cambios from anon;
revoke insert, update, delete on public.registro_cambios from authenticated;

-- 4. Auditoría de precios (solo registra si el precio cambió).
create or replace function public.auditar_cambio_precio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text;
  v_id uuid;
  v_proveedor uuid;
  v_producto_id uuid;
  v_anterior numeric;
  v_nuevo numeric;
  v_producto text;
begin
  if tg_op = 'DELETE' then
    v_id := old.id; v_proveedor := old.proveedor_id; v_producto_id := old.producto_id;
    v_anterior := old.precio; v_nuevo := null;
  elsif tg_op = 'INSERT' then
    v_id := new.id; v_proveedor := new.proveedor_id; v_producto_id := new.producto_id;
    v_anterior := null; v_nuevo := new.precio;
  else
    if new.precio is not distinct from old.precio then
      return null;
    end if;
    v_id := new.id; v_proveedor := new.proveedor_id; v_producto_id := new.producto_id;
    v_anterior := old.precio; v_nuevo := new.precio;
  end if;

  select nombre into v_nombre from public.perfiles where id = auth.uid();
  select nombre into v_producto from public.productos where id = v_producto_id;

  insert into public.registro_cambios (usuario_id, usuario_nombre, tabla, registro_id, operacion, proveedor_id, detalle)
  values (
    auth.uid(), coalesce(v_nombre, 'Sistema'), 'precios_proveedor', v_id, lower(tg_op), v_proveedor,
    jsonb_build_object('producto_id', v_producto_id, 'producto', v_producto,
                       'precio_anterior', v_anterior, 'precio_nuevo', v_nuevo)
  );
  return null;
end
$$;

create trigger precios_proveedor_auditar
  after insert or update or delete on public.precios_proveedor
  for each row execute function public.auditar_cambio_precio();

-- 5. Auditoría de proveedores (en una edición guarda solo los campos que cambiaron).
create or replace function public.auditar_cambio_proveedor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text;
  v_id uuid;
  v_detalle jsonb := '{}'::jsonb;
  v_viejo jsonb;
  v_nuevo jsonb;
  v_campo text;
  v_ignorar text[] := array['cantidad_boletas', 'total_acumulado', 'primera_boleta', 'ultima_boleta'];
begin
  if tg_op = 'DELETE' then
    v_id := old.id;
    v_detalle := jsonb_build_object('nombre', old.nombre);
  elsif tg_op = 'INSERT' then
    v_id := new.id;
    v_detalle := jsonb_build_object('nombre', new.nombre);
  else
    v_id := new.id;
    v_viejo := to_jsonb(old);
    v_nuevo := to_jsonb(new);
    for v_campo in select key from jsonb_each(v_nuevo) loop
      if v_campo = any (v_ignorar) then
        continue;
      end if;
      if (v_nuevo -> v_campo) is distinct from (v_viejo -> v_campo) then
        v_detalle := v_detalle || jsonb_build_object(
          v_campo, jsonb_build_object('antes', v_viejo -> v_campo, 'despues', v_nuevo -> v_campo));
      end if;
    end loop;
    if v_detalle = '{}'::jsonb then
      return null;
    end if;
  end if;

  select nombre into v_nombre from public.perfiles where id = auth.uid();

  insert into public.registro_cambios (usuario_id, usuario_nombre, tabla, registro_id, operacion, proveedor_id, detalle)
  values (auth.uid(), coalesce(v_nombre, 'Sistema'), 'proveedores', v_id, lower(tg_op), v_id, v_detalle);
  return null;
end
$$;

create trigger proveedores_auditar
  after insert or update or delete on public.proveedores
  for each row execute function public.auditar_cambio_proveedor();

-- 6. Las funciones de trigger no deben poder llamarse desde la API.
revoke all on function public.proteger_datos_fiscales_proveedor() from public, anon, authenticated;
revoke all on function public.auditar_cambio_precio() from public, anon, authenticated;
revoke all on function public.auditar_cambio_proveedor() from public, anon, authenticated;
```

- [ ] **Paso 2: commit del archivo**

```bash
git add supabase/migrations/0035_comparador_empleados_y_registro.sql
git commit -m "feat: migración 0035 con permisos de empleados, protección fiscal y registro de cambios"
```

- [ ] **Paso 3: la persona dueña la ejecuta en Supabase (SQL Editor → Run)**

Claude no puede aplicarla (acceso de solo lectura). Hay que pedirle que pegue el contenido del archivo y avisar cuando termine.

- [ ] **Paso 4: verificar en solo lectura (`execute_sql`)**

Consulta A — políticas (esperado: `precios_proveedor_insertar`/`_actualizar` y `proveedores_insertar`/`_actualizar` para `authenticated` con `true`; los `*_borrar_admin` siguen):

```sql
select tablename, policyname, cmd from pg_policies
where schemaname = 'public' and tablename in ('precios_proveedor', 'proveedores', 'registro_cambios')
order by tablename, cmd, policyname;
```

Consulta B — triggers (esperado: `proveedores_proteger_fiscales`, `proveedores_auditar`, `precios_proveedor_auditar`):

```sql
select event_object_table, trigger_name, event_manipulation from information_schema.triggers
where trigger_schema = 'public' and trigger_name in ('proveedores_proteger_fiscales', 'proveedores_auditar', 'precios_proveedor_auditar')
order by 1, 2, 3;
```

Consulta C — seguridad de la tabla y de las funciones (esperado: RLS `true`; `auth_ejecuta` y `anon_ejecuta` en `false`; `authenticated_escribe` en `false`):

```sql
select
  (select relrowsecurity from pg_class where oid = 'public.registro_cambios'::regclass) as rls,
  has_table_privilege('authenticated', 'public.registro_cambios', 'INSERT') as authenticated_escribe,
  has_function_privilege('authenticated', 'public.auditar_cambio_precio()', 'execute') as auth_ejecuta,
  has_function_privilege('anon', 'public.auditar_cambio_proveedor()', 'execute') as anon_ejecuta;
```

---

### Tarea 6: Prueba real con un empleado, documentación y cierre

**Archivos:**
- Modificar: `docs/ARQUITECTURA.md`

- [ ] **Paso 1: documentar**

Agregar a `docs/ARQUITECTURA.md` una sección "Permisos de empleados en proveedores y comparador" con la tabla de permisos del spec y una descripción breve de `registro_cambios` y sus triggers. Ejecutar `npm run lint` y commit:

```bash
git add docs/ARQUITECTURA.md
git commit -m "docs: permisos de empleados en proveedores y comparador, y registro de cambios"
```

- [ ] **Paso 2: pedir el push y esperar el despliegue**

Con el visto bueno de la persona dueña: `git push origin main`. Esperar a que Vercel marque el commit como exitoso (`gh api repos/christianmarotz-code/planeta-animal/commits/<sha>/status --jq .state`).

- [ ] **Paso 3: prueba manual con un empleado de prueba**

1. Como administrador, invitar a una cuenta de prueba como **empleado** desde Usuarios y completar la contraseña (flujo ya probado).
2. Entrar como ese empleado (ventana privada) y comprobar: el menú muestra **Comparador**; la pantalla de importar abre sin "Acceso restringido".
3. Crear un proveedor nuevo: el formulario no muestra los campos fiscales; se guarda.
4. Editar el teléfono de ese proveedor y entrar a su pantalla: aparece en "Historial de cambios" con el nombre del empleado.
5. Importar un CSV chico de 2 productos para ese proveedor; abrir el proveedor y ver "Cargó el precio de …".
6. Importar el mismo CSV otra vez: no aparecen filas nuevas en el historial.
7. Confirmar que ese empleado no ve botones de borrar proveedor o precios.
8. Verificar en solo lectura (`execute_sql`) que `registro_cambios` tiene las filas esperadas con `usuario_nombre` del empleado.

- [ ] **Paso 4: limpieza**

Como administrador, eliminar a la cuenta de prueba desde Usuarios, y el proveedor y los precios de prueba. Verificar con `select` que el registro de cambios conserva las filas con `usuario_id` nulo y el `usuario_nombre` original.

- [ ] **Paso 5: actualizar la memoria del proyecto**

Actualizar `acceso-y-seguridad-decisiones.md` (empleados pueden crear/editar proveedores y cargar precios, no tocar datos fiscales, y existe `registro_cambios`).
