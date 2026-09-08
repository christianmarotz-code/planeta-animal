# Fase 1 — Proveedores, Productos, Compras y Stock — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js + Supabase web app where 2-5 logged-in users can register suppliers, products, and purchase invoices, with automatic stock and cost updates, and basic spend/stock-value reports.

**Architecture:** Single Next.js (App Router, TypeScript) project deployed to Vercel. Supabase provides Postgres (data), Auth (email/password login), and Storage (optional invoice file attachments). Business-critical calculations (unit conversion, IVA, totals) live as pure, unit-tested TypeScript functions in `lib/calc/`. Writes that must be atomic (registering an invoice, adjusting stock) go through Postgres RPC functions so the stock/cost update and the audit trail (`movimientos_stock`) never get out of sync.

**Tech Stack:** Next.js 14 (App Router, TypeScript), Tailwind CSS, Supabase (Postgres + Auth + Storage), Vitest for unit tests, Vercel for deployment.

**Spec:** `docs/superpowers/specs/2026-09-08-compras-stock-fase1-design.md`

## Global Constraints

- Argentina fiscal fields required on every purchase invoice: CUIT (on proveedor), `tipo_comprobante` (Factura A/B/C, Remito, Nota de Crédito), IVA per item.
- Single location/warehouse — no per-branch stock split.
- All 2-5 users share the same access level in this phase (no roles/permissions yet — that's Fase 4). Every screen requires login; there is no distinction beyond "logged in or not."
- Products may be fractionable: `unidad_compra` (purchase unit) and `unidad_stock` (stock unit) can differ, related by `factor_conversion`. Non-fractionable products use `factor_conversion = 1` and equal units — no special-casing.
- A saved invoice is never edited in place — only annulled (`estado = 'anulada'`), preserving history.
- Every manual stock adjustment requires a non-empty reason (`motivo`).
- Invoice totals (`subtotal`, `iva_total`, `total`) are always computed from line items, never entered by hand.
- Responsive UI: must work in a mobile browser (phone/tablet) and desktop, no native app.

---

## File Structure

```
app/
  login/page.tsx                     # login form
  (app)/layout.tsx                   # protected shell: nav + auth guard (server component)
  (app)/proveedores/page.tsx         # list
  (app)/proveedores/nuevo/page.tsx   # create
  (app)/proveedores/[id]/page.tsx    # edit + purchase history
  (app)/productos/page.tsx           # list + filters
  (app)/productos/nuevo/page.tsx     # create
  (app)/productos/[id]/page.tsx      # edit
  (app)/compras/page.tsx             # invoice list + filters
  (app)/compras/nueva/page.tsx       # new invoice form
  (app)/compras/[id]/page.tsx        # invoice detail + anular
  (app)/stock/page.tsx               # stock list + alerts + manual adjustment
  (app)/reportes/page.tsx            # spend + stock value reports
middleware.ts                        # redirects unauthenticated users to /login
lib/
  supabase/client.ts                 # browser Supabase client
  supabase/server.ts                 # server Supabase client (RSC/middleware)
  calc/factura.ts                    # pure calculation functions (unit tested)
  calc/factura.test.ts
  data/proveedores.ts                # CRUD against `proveedores`
  data/productos.ts                  # CRUD against `productos`
  data/facturas.ts                   # invoice CRUD + calls to RPCs
  data/stock.ts                      # stock queries + manual adjustment RPC call
  data/reportes.ts                   # aggregate report queries
types/database.ts                    # TS types mirroring the schema
supabase/migrations/
  0001_init_schema.sql               # tables + RLS
  0002_registrar_factura_compra.sql  # atomic invoice registration RPC
  0003_ajustar_stock_manual.sql      # atomic manual stock adjustment RPC
```

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.js`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `vitest.config.ts`, `.env.local.example`, `.gitignore`

**Interfaces:**
- Produces: a running `npm run dev` Next.js app, and `npm test` running Vitest.

- [ ] **Step 1: Scaffold the app**

```bash
cd "/Users/nachocachaza/Downloads/Planeta Animal"
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm --no-git
```
Answer "Yes" if prompted to use App Router; decline Turbopack prompt (default is fine).

- [ ] **Step 2: Install Supabase + testing dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: Add Vitest config**

`vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
```

- [ ] **Step 4: Add a test script and verify it runs**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run"
```

Run: `npm test`
Expected: `No test files found` (passes with zero tests — confirms Vitest is wired up).

- [ ] **Step 5: Create env var template**

`.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + Tailwind + Vitest project"
```

---

### Task 2: Supabase project and client setup

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `.env.local` (not committed)

**Interfaces:**
- Produces: `createBrowserClient()` from `lib/supabase/client.ts`, `createServerClient()` from `lib/supabase/server.ts` — both return a configured Supabase JS client typed with `Database` from `types/database.ts` (defined in Task 3).

- [ ] **Step 1: Create the Supabase project**

Go to https://supabase.com/dashboard, create a new project named `planeta-animal`. Copy the Project URL and `anon` public key into `.env.local` (create this file, it's gitignored by `create-next-app` by default — verify `.gitignore` contains `.env*.local`).

- [ ] **Step 2: Browser client**

`lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 3: Server client**

`lib/supabase/server.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/supabase .gitignore
git commit -m "feat: add Supabase browser and server clients"
```

(`types/database.ts` doesn't exist yet — this task only wires the clients; Task 3 adds the type file, so this compiles once Task 3 lands. Commit anyway; it's a standalone, reviewable step.)

---

### Task 3: Database schema and RLS

**Files:**
- Create: `supabase/migrations/0001_init_schema.sql`, `types/database.ts`

**Interfaces:**
- Produces: tables `proveedores`, `productos`, `facturas_compra`, `items_factura`, `movimientos_stock`; TS type `Database` matching them exactly (field names below are the contract every later task's data-layer code relies on).

- [ ] **Step 1: Write the migration**

`supabase/migrations/0001_init_schema.sql`:
```sql
create table proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cuit text,
  telefono text,
  email text,
  direccion text,
  notas text,
  created_at timestamptz not null default now()
);

create table productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text,
  unidad_compra text not null,
  unidad_stock text not null,
  factor_conversion numeric not null default 1 check (factor_conversion > 0),
  stock_actual numeric not null default 0,
  stock_minimo numeric not null default 0,
  costo_unitario_actual numeric not null default 0,
  alicuota_iva numeric not null default 21,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table facturas_compra (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references proveedores(id),
  numero_comprobante text not null,
  tipo_comprobante text not null check (
    tipo_comprobante in ('Factura A', 'Factura B', 'Factura C', 'Remito', 'Nota de Credito')
  ),
  fecha date not null,
  subtotal numeric not null check (subtotal >= 0),
  iva_total numeric not null check (iva_total >= 0),
  total numeric not null check (total >= 0),
  estado text not null default 'cargada' check (estado in ('cargada', 'anulada')),
  archivo_adjunto text,
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table items_factura (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid not null references facturas_compra(id) on delete cascade,
  producto_id uuid not null references productos(id),
  cantidad numeric not null check (cantidad > 0),
  costo_unitario numeric not null check (costo_unitario > 0),
  alicuota_iva numeric not null,
  subtotal numeric not null
);

create table movimientos_stock (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id),
  tipo text not null check (tipo in ('entrada_compra', 'ajuste_manual')),
  cantidad numeric not null,
  fecha timestamptz not null default now(),
  factura_id uuid references facturas_compra(id),
  motivo text,
  usuario_id uuid references auth.users(id)
);

alter table proveedores enable row level security;
alter table productos enable row level security;
alter table facturas_compra enable row level security;
alter table items_factura enable row level security;
alter table movimientos_stock enable row level security;

-- Fase 1: every authenticated user has full access (roles arrive in Fase 4).
create policy "authenticated_full_access" on proveedores
  for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on productos
  for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on facturas_compra
  for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on items_factura
  for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on movimientos_stock
  for all to authenticated using (true) with check (true);
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```
Expected: CLI reports migration `0001_init_schema.sql` applied.

- [ ] **Step 3: Write the TS types**

`types/database.ts`:
```typescript
export interface Proveedor {
  id: string
  nombre: string
  cuit: string | null
  telefono: string | null
  email: string | null
  direccion: string | null
  notas: string | null
  created_at: string
}

export interface Producto {
  id: string
  nombre: string
  categoria: string | null
  unidad_compra: string
  unidad_stock: string
  factor_conversion: number
  stock_actual: number
  stock_minimo: number
  costo_unitario_actual: number
  alicuota_iva: number
  activo: boolean
  created_at: string
}

export type TipoComprobante =
  | 'Factura A'
  | 'Factura B'
  | 'Factura C'
  | 'Remito'
  | 'Nota de Credito'

export type EstadoFactura = 'cargada' | 'anulada'

export interface FacturaCompra {
  id: string
  proveedor_id: string
  numero_comprobante: string
  tipo_comprobante: TipoComprobante
  fecha: string
  subtotal: number
  iva_total: number
  total: number
  estado: EstadoFactura
  archivo_adjunto: string | null
  notas: string | null
  created_at: string
  created_by: string | null
}

export interface ItemFactura {
  id: string
  factura_id: string
  producto_id: string
  cantidad: number
  costo_unitario: number
  alicuota_iva: number
  subtotal: number
}

export type TipoMovimientoStock = 'entrada_compra' | 'ajuste_manual'

export interface MovimientoStock {
  id: string
  producto_id: string
  tipo: TipoMovimientoStock
  cantidad: number
  fecha: string
  factura_id: string | null
  motivo: string | null
  usuario_id: string | null
}

export interface Database {
  public: {
    Tables: {
      proveedores: { Row: Proveedor; Insert: Partial<Proveedor>; Update: Partial<Proveedor> }
      productos: { Row: Producto; Insert: Partial<Producto>; Update: Partial<Producto> }
      facturas_compra: {
        Row: FacturaCompra
        Insert: Partial<FacturaCompra>
        Update: Partial<FacturaCompra>
      }
      items_factura: {
        Row: ItemFactura
        Insert: Partial<ItemFactura>
        Update: Partial<ItemFactura>
      }
      movimientos_stock: {
        Row: MovimientoStock
        Insert: Partial<MovimientoStock>
        Update: Partial<MovimientoStock>
      }
    }
  }
}
```

- [ ] **Step 4: Verify the project still builds**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_init_schema.sql types/database.ts
git commit -m "feat: add database schema, RLS policies, and TS types"
```

---

### Task 4: Authentication

**Files:**
- Create: `app/login/page.tsx`, `middleware.ts`, `app/(app)/layout.tsx`

**Interfaces:**
- Produces: `middleware.ts` redirects any unauthenticated request under `(app)` to `/login`. `app/(app)/layout.tsx` renders nav (Proveedores, Productos, Compras, Stock, Reportes, "Cerrar sesión").

- [ ] **Step 1: Login page**

`app/login/page.tsx`:
```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email o contraseña incorrectos.')
      return
    }
    router.push('/proveedores')
    router.refresh()
  }

  return (
    <main className="mx-auto mt-24 max-w-sm p-4">
      <h1 className="mb-6 text-xl font-semibold">Planeta Animal — Ingresar</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border p-2"
          required
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border p-2"
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="rounded bg-slate-900 p-2 text-white">
          Ingresar
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 2: Middleware auth guard**

`middleware.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthRoute = request.nextUrl.pathname === '/login'

  if (!user && !isAuthRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL('/proveedores', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 3: Protected layout with nav**

`app/(app)/layout.tsx`:
```typescript
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen">
      <nav className="flex flex-wrap gap-4 border-b p-4">
        <Link href="/proveedores">Proveedores</Link>
        <Link href="/productos">Productos</Link>
        <Link href="/compras">Compras</Link>
        <Link href="/stock">Stock</Link>
        <Link href="/reportes">Reportes</Link>
        <form action="/api/auth/signout" method="post" className="ml-auto">
          <button type="submit" className="text-sm text-slate-500">
            Cerrar sesión
          </button>
        </form>
      </nav>
      <main className="p-4">{children}</main>
    </div>
  )
}
```

- [ ] **Step 4: Sign-out route**

`app/api/auth/signout/route.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', request.url))
}
```

- [ ] **Step 5: Manually verify**

Run `npm run dev`, visit `http://localhost:3000/proveedores` while logged out — confirm redirect to `/login`. Create a user in the Supabase Auth dashboard, log in, confirm redirect to `/proveedores` and the nav renders.

- [ ] **Step 6: Commit**

```bash
git add app/login middleware.ts "app/(app)/layout.tsx" app/api/auth
git commit -m "feat: add login page, auth middleware, and protected layout"
```

---

### Task 5: Invoice calculation logic (TDD)

**Files:**
- Create: `lib/calc/factura.ts`, `lib/calc/factura.test.ts`

**Interfaces:**
- Produces:
  - `calcularSubtotalItem(cantidad: number, costoUnitario: number): number`
  - `calcularIvaItem(subtotalItem: number, alicuotaIva: number): number`
  - `calcularTotalesFactura(items: { cantidad: number; costoUnitario: number; alicuotaIva: number }[]): { subtotal: number; ivaTotal: number; total: number }`
  - `convertirCantidadAUnidadStock(cantidadCompra: number, factorConversion: number): number`
  - `convertirCostoAUnidadStock(costoUnitarioCompra: number, factorConversion: number): number`
- Consumed by: Task 9 (new-invoice form, live totals) and mirrored in Task 6's SQL RPC (same formulas, so both layers agree).

- [ ] **Step 1: Write the failing tests**

`lib/calc/factura.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import {
  calcularSubtotalItem,
  calcularIvaItem,
  calcularTotalesFactura,
  convertirCantidadAUnidadStock,
  convertirCostoAUnidadStock,
} from './factura'

describe('calcularSubtotalItem', () => {
  it('multiplies quantity by unit cost', () => {
    expect(calcularSubtotalItem(3, 1500)).toBe(4500)
  })
})

describe('calcularIvaItem', () => {
  it('applies the IVA rate as a percentage', () => {
    expect(calcularIvaItem(4500, 21)).toBeCloseTo(945)
  })
  it('returns 0 for a 0% rate', () => {
    expect(calcularIvaItem(1000, 0)).toBe(0)
  })
})

describe('calcularTotalesFactura', () => {
  it('sums subtotal, IVA, and total across multiple items', () => {
    const items = [
      { cantidad: 3, costoUnitario: 1500, alicuotaIva: 21 },
      { cantidad: 2, costoUnitario: 500, alicuotaIva: 10.5 },
    ]
    const result = calcularTotalesFactura(items)
    expect(result.subtotal).toBe(5500)
    expect(result.ivaTotal).toBeCloseTo(945 + 105)
    expect(result.total).toBeCloseTo(5500 + 945 + 105)
  })

  it('returns all zeros for an empty item list', () => {
    expect(calcularTotalesFactura([])).toEqual({ subtotal: 0, ivaTotal: 0, total: 0 })
  })
})

describe('convertirCantidadAUnidadStock', () => {
  it('converts a fractionable product (1 box = 30 tablets)', () => {
    expect(convertirCantidadAUnidadStock(2, 30)).toBe(60)
  })
  it('leaves a non-fractionable product unchanged (factor 1)', () => {
    expect(convertirCantidadAUnidadStock(5, 1)).toBe(5)
  })
})

describe('convertirCostoAUnidadStock', () => {
  it('divides the purchase unit cost by the conversion factor', () => {
    expect(convertirCostoAUnidadStock(3000, 30)).toBe(100)
  })
  it('leaves a non-fractionable product unchanged (factor 1)', () => {
    expect(convertirCostoAUnidadStock(250, 1)).toBe(250)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './factura'`.

- [ ] **Step 3: Implement**

`lib/calc/factura.ts`:
```typescript
export function calcularSubtotalItem(cantidad: number, costoUnitario: number): number {
  return cantidad * costoUnitario
}

export function calcularIvaItem(subtotalItem: number, alicuotaIva: number): number {
  return subtotalItem * (alicuotaIva / 100)
}

export function calcularTotalesFactura(
  items: { cantidad: number; costoUnitario: number; alicuotaIva: number }[]
): { subtotal: number; ivaTotal: number; total: number } {
  let subtotal = 0
  let ivaTotal = 0
  for (const item of items) {
    const subtotalItem = calcularSubtotalItem(item.cantidad, item.costoUnitario)
    subtotal += subtotalItem
    ivaTotal += calcularIvaItem(subtotalItem, item.alicuotaIva)
  }
  return { subtotal, ivaTotal, total: subtotal + ivaTotal }
}

export function convertirCantidadAUnidadStock(
  cantidadCompra: number,
  factorConversion: number
): number {
  return cantidadCompra * factorConversion
}

export function convertirCostoAUnidadStock(
  costoUnitarioCompra: number,
  factorConversion: number
): number {
  return costoUnitarioCompra / factorConversion
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/calc
git commit -m "feat: add unit-tested invoice calculation functions"
```

---

### Task 6: Atomic invoice registration (RPC + data layer)

**Files:**
- Create: `supabase/migrations/0002_registrar_factura_compra.sql`, `lib/data/facturas.ts`

**Interfaces:**
- Consumes: `Database`, `FacturaCompra`, `ItemFactura` types (Task 3).
- Produces:
  - SQL function `registrar_factura_compra(payload jsonb) returns uuid` — inserts the invoice, its items, one `movimientos_stock` row per item, and updates `productos.stock_actual` / `costo_unitario_actual`, all in one transaction (a raised exception rolls back everything).
  - `registrarFacturaCompra(input: NuevaFacturaInput): Promise<{ id: string }>` in `lib/data/facturas.ts`, calling that RPC.
  - `listarFacturas(filtros?: { proveedorId?: string; desde?: string; hasta?: string }): Promise<FacturaCompra[]>`
  - `obtenerFacturaConItems(id: string): Promise<{ factura: FacturaCompra; items: ItemFactura[] }>`
  - `anularFactura(id: string): Promise<void>` — sets `estado = 'anulada'` and inserts compensating `movimientos_stock` rows (negative of the original entrada) so `stock_actual` reflects the annulment without deleting history.

- [ ] **Step 1: Write the RPC migration**

`supabase/migrations/0002_registrar_factura_compra.sql`:
```sql
create or replace function registrar_factura_compra(payload jsonb)
returns uuid
language plpgsql
security definer
as $$
declare
  v_factura_id uuid;
  v_item jsonb;
  v_producto_id uuid;
  v_cantidad numeric;
  v_costo_unitario numeric;
  v_alicuota_iva numeric;
  v_subtotal_item numeric;
  v_factor_conversion numeric;
  v_cantidad_stock numeric;
  v_costo_stock numeric;
begin
  insert into facturas_compra (
    proveedor_id, numero_comprobante, tipo_comprobante, fecha,
    subtotal, iva_total, total, archivo_adjunto, notas, created_by
  )
  values (
    (payload->>'proveedor_id')::uuid,
    payload->>'numero_comprobante',
    payload->>'tipo_comprobante',
    (payload->>'fecha')::date,
    (payload->>'subtotal')::numeric,
    (payload->>'iva_total')::numeric,
    (payload->>'total')::numeric,
    payload->>'archivo_adjunto',
    payload->>'notas',
    auth.uid()
  )
  returning id into v_factura_id;

  for v_item in select * from jsonb_array_elements(payload->'items')
  loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::numeric;
    v_costo_unitario := (v_item->>'costo_unitario')::numeric;
    v_alicuota_iva := (v_item->>'alicuota_iva')::numeric;
    v_subtotal_item := v_cantidad * v_costo_unitario;

    insert into items_factura (
      factura_id, producto_id, cantidad, costo_unitario, alicuota_iva, subtotal
    )
    values (
      v_factura_id, v_producto_id, v_cantidad, v_costo_unitario, v_alicuota_iva, v_subtotal_item
    );

    select factor_conversion into v_factor_conversion
    from productos where id = v_producto_id;

    v_cantidad_stock := v_cantidad * v_factor_conversion;
    v_costo_stock := v_costo_unitario / v_factor_conversion;

    insert into movimientos_stock (producto_id, tipo, cantidad, factura_id, usuario_id)
    values (v_producto_id, 'entrada_compra', v_cantidad_stock, v_factura_id, auth.uid());

    update productos
    set stock_actual = stock_actual + v_cantidad_stock,
        costo_unitario_actual = v_costo_stock
    where id = v_producto_id;
  end loop;

  return v_factura_id;
end;
$$;

create or replace function anular_factura_compra(p_factura_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_mov record;
begin
  update facturas_compra set estado = 'anulada' where id = p_factura_id;

  for v_mov in
    select producto_id, cantidad from movimientos_stock
    where factura_id = p_factura_id and tipo = 'entrada_compra'
  loop
    insert into movimientos_stock (producto_id, tipo, cantidad, factura_id, motivo, usuario_id)
    values (
      v_mov.producto_id, 'ajuste_manual', -v_mov.cantidad, p_factura_id,
      'Anulación de factura', auth.uid()
    );

    update productos
    set stock_actual = stock_actual - v_mov.cantidad
    where id = v_mov.producto_id;
  end loop;
end;
$$;
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```
Expected: CLI reports migration `0002_registrar_factura_compra.sql` applied.

- [ ] **Step 3: Implement the data layer**

`lib/data/facturas.ts`:
```typescript
import { createClient } from '@/lib/supabase/client'
import type { FacturaCompra, ItemFactura, TipoComprobante } from '@/types/database'

export interface NuevaFacturaItemInput {
  producto_id: string
  cantidad: number
  costo_unitario: number
  alicuota_iva: number
}

export interface NuevaFacturaInput {
  proveedor_id: string
  numero_comprobante: string
  tipo_comprobante: TipoComprobante
  fecha: string
  subtotal: number
  iva_total: number
  total: number
  archivo_adjunto?: string | null
  notas?: string | null
  items: NuevaFacturaItemInput[]
}

export async function registrarFacturaCompra(input: NuevaFacturaInput): Promise<{ id: string }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('registrar_factura_compra', { payload: input })
  if (error) throw error
  return { id: data as string }
}

export async function listarFacturas(filtros?: {
  proveedorId?: string
  desde?: string
  hasta?: string
}): Promise<FacturaCompra[]> {
  const supabase = createClient()
  let query = supabase.from('facturas_compra').select('*').order('fecha', { ascending: false })
  if (filtros?.proveedorId) query = query.eq('proveedor_id', filtros.proveedorId)
  if (filtros?.desde) query = query.gte('fecha', filtros.desde)
  if (filtros?.hasta) query = query.lte('fecha', filtros.hasta)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function obtenerFacturaConItems(
  id: string
): Promise<{ factura: FacturaCompra; items: ItemFactura[] }> {
  const supabase = createClient()
  const [{ data: factura, error: facturaError }, { data: items, error: itemsError }] =
    await Promise.all([
      supabase.from('facturas_compra').select('*').eq('id', id).single(),
      supabase.from('items_factura').select('*').eq('factura_id', id),
    ])
  if (facturaError) throw facturaError
  if (itemsError) throw itemsError
  return { factura, items: items ?? [] }
}

export async function anularFactura(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('anular_factura_compra', { p_factura_id: id })
  if (error) throw error
}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_registrar_factura_compra.sql lib/data/facturas.ts
git commit -m "feat: add atomic invoice registration and annulment RPCs"
```

---

### Task 7: Proveedores — data layer and screens

**Files:**
- Create: `lib/data/proveedores.ts`, `app/(app)/proveedores/page.tsx`, `app/(app)/proveedores/nuevo/page.tsx`, `app/(app)/proveedores/[id]/page.tsx`, `app/(app)/proveedores/ProveedorForm.tsx`

**Interfaces:**
- Consumes: `Proveedor` type (Task 3), `listarFacturas` (Task 6, for the supplier's purchase history).
- Produces: `listarProveedores(): Promise<Proveedor[]>`, `obtenerProveedor(id: string): Promise<Proveedor>`, `crearProveedor(input: Omit<Proveedor, 'id' | 'created_at'>): Promise<Proveedor>`, `actualizarProveedor(id: string, input: Partial<Proveedor>): Promise<void>` — reused by Task 9 (supplier picker in the new-invoice form).

- [ ] **Step 1: Data layer**

`lib/data/proveedores.ts`:
```typescript
import { createClient } from '@/lib/supabase/client'
import type { Proveedor } from '@/types/database'

export async function listarProveedores(): Promise<Proveedor[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('proveedores').select('*').order('nombre')
  if (error) throw error
  return data
}

export async function obtenerProveedor(id: string): Promise<Proveedor> {
  const supabase = createClient()
  const { data, error } = await supabase.from('proveedores').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function crearProveedor(
  input: Omit<Proveedor, 'id' | 'created_at'>
): Promise<Proveedor> {
  const supabase = createClient()
  const { data, error } = await supabase.from('proveedores').insert(input).select().single()
  if (error) throw error
  return data
}

export async function actualizarProveedor(id: string, input: Partial<Proveedor>): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('proveedores').update(input).eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 2: Shared form component**

`app/(app)/proveedores/ProveedorForm.tsx`:
```typescript
'use client'

import { useState } from 'react'
import type { Proveedor } from '@/types/database'

export interface ProveedorFormValues {
  nombre: string
  cuit: string
  telefono: string
  email: string
  direccion: string
  notas: string
}

export function ProveedorForm({
  initial,
  onSubmit,
  submitLabel,
}: {
  initial?: Partial<Proveedor>
  onSubmit: (values: ProveedorFormValues) => Promise<void>
  submitLabel: string
}) {
  const [values, setValues] = useState<ProveedorFormValues>({
    nombre: initial?.nombre ?? '',
    cuit: initial?.cuit ?? '',
    telefono: initial?.telefono ?? '',
    email: initial?.email ?? '',
    direccion: initial?.direccion ?? '',
    notas: initial?.notas ?? '',
  })
  const [saving, setSaving] = useState(false)

  function set<K extends keyof ProveedorFormValues>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSubmit(values)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-3">
      <input
        required
        placeholder="Nombre"
        value={values.nombre}
        onChange={(e) => set('nombre', e.target.value)}
        className="rounded border p-2"
      />
      <input
        placeholder="CUIT"
        value={values.cuit}
        onChange={(e) => set('cuit', e.target.value)}
        className="rounded border p-2"
      />
      <input
        placeholder="Teléfono"
        value={values.telefono}
        onChange={(e) => set('telefono', e.target.value)}
        className="rounded border p-2"
      />
      <input
        placeholder="Email"
        value={values.email}
        onChange={(e) => set('email', e.target.value)}
        className="rounded border p-2"
      />
      <input
        placeholder="Dirección"
        value={values.direccion}
        onChange={(e) => set('direccion', e.target.value)}
        className="rounded border p-2"
      />
      <textarea
        placeholder="Notas"
        value={values.notas}
        onChange={(e) => set('notas', e.target.value)}
        className="rounded border p-2"
      />
      <button
        type="submit"
        disabled={saving}
        className="rounded bg-slate-900 p-2 text-white disabled:opacity-50"
      >
        {saving ? 'Guardando…' : submitLabel}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: List screen**

`app/(app)/proveedores/page.tsx`:
```typescript
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listarProveedores } from '@/lib/data/proveedores'
import type { Proveedor } from '@/types/database'

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listarProveedores()
      .then(setProveedores)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Proveedores</h1>
        <Link href="/proveedores/nuevo" className="rounded bg-slate-900 px-3 py-2 text-white">
          Nuevo proveedor
        </Link>
      </div>
      {loading ? (
        <p>Cargando…</p>
      ) : (
        <ul className="divide-y rounded border">
          {proveedores.map((p) => (
            <li key={p.id} className="p-3 hover:bg-slate-50">
              <Link href={`/proveedores/${p.id}`}>
                <span className="font-medium">{p.nombre}</span>
                {p.cuit && <span className="ml-2 text-sm text-slate-500">CUIT {p.cuit}</span>}
              </Link>
            </li>
          ))}
          {proveedores.length === 0 && <li className="p-3 text-slate-500">Sin proveedores aún.</li>}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create screen**

`app/(app)/proveedores/nuevo/page.tsx`:
```typescript
'use client'

import { useRouter } from 'next/navigation'
import { crearProveedor } from '@/lib/data/proveedores'
import { ProveedorForm } from '../ProveedorForm'

export default function NuevoProveedorPage() {
  const router = useRouter()
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Nuevo proveedor</h1>
      <ProveedorForm
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

- [ ] **Step 5: Edit screen with purchase history**

`app/(app)/proveedores/[id]/page.tsx`:
```typescript
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { obtenerProveedor, actualizarProveedor } from '@/lib/data/proveedores'
import { listarFacturas } from '@/lib/data/facturas'
import type { Proveedor, FacturaCompra } from '@/types/database'
import { ProveedorForm } from '../ProveedorForm'

export default function EditarProveedorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [proveedor, setProveedor] = useState<Proveedor | null>(null)
  const [facturas, setFacturas] = useState<FacturaCompra[]>([])

  useEffect(() => {
    obtenerProveedor(id).then(setProveedor)
    listarFacturas({ proveedorId: id }).then(setFacturas)
  }, [id])

  if (!proveedor) return <p>Cargando…</p>

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="mb-4 text-xl font-semibold">Editar proveedor</h1>
        <ProveedorForm
          initial={proveedor}
          submitLabel="Guardar cambios"
          onSubmit={async (values) => {
            await actualizarProveedor(id, values)
            router.push('/proveedores')
          }}
        />
      </div>
      <div>
        <h2 className="mb-2 font-semibold">Historial de compras</h2>
        <ul className="divide-y rounded border">
          {facturas.map((f) => (
            <li key={f.id} className="p-3">
              {f.fecha} — {f.tipo_comprobante} {f.numero_comprobante} — $
              {f.total.toLocaleString('es-AR')}
            </li>
          ))}
          {facturas.length === 0 && <li className="p-3 text-slate-500">Sin compras aún.</li>}
        </ul>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Manually verify**

Run `npm run dev`, log in, go to `/proveedores`, create a supplier, edit it, confirm the list reflects changes.

- [ ] **Step 7: Commit**

```bash
git add lib/data/proveedores.ts "app/(app)/proveedores"
git commit -m "feat: add proveedores CRUD screens"
```

---

### Task 8: Productos — data layer and screens

**Files:**
- Create: `lib/data/productos.ts`, `app/(app)/productos/page.tsx`, `app/(app)/productos/nuevo/page.tsx`, `app/(app)/productos/[id]/page.tsx`, `app/(app)/productos/ProductoForm.tsx`

**Interfaces:**
- Consumes: `Producto` type (Task 3).
- Produces: `listarProductos(filtros?: { categoria?: string; soloStockBajo?: boolean }): Promise<Producto[]>`, `obtenerProducto(id: string): Promise<Producto>`, `crearProducto(input): Promise<Producto>`, `actualizarProducto(id: string, input: Partial<Producto>): Promise<void>` — reused by Task 9 (product picker + inline creation), Task 11 (stock screen), Task 12 (reports).

- [ ] **Step 1: Data layer**

`lib/data/productos.ts`:
```typescript
import { createClient } from '@/lib/supabase/client'
import type { Producto } from '@/types/database'

export async function listarProductos(filtros?: {
  categoria?: string
  soloStockBajo?: boolean
}): Promise<Producto[]> {
  const supabase = createClient()
  let query = supabase.from('productos').select('*').eq('activo', true).order('nombre')
  if (filtros?.categoria) query = query.eq('categoria', filtros.categoria)
  const { data, error } = await query
  if (error) throw error
  if (filtros?.soloStockBajo) {
    return data.filter((p) => p.stock_actual <= p.stock_minimo)
  }
  return data
}

export async function obtenerProducto(id: string): Promise<Producto> {
  const supabase = createClient()
  const { data, error } = await supabase.from('productos').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function crearProducto(
  input: Omit<Producto, 'id' | 'created_at' | 'stock_actual' | 'costo_unitario_actual'>
): Promise<Producto> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('productos')
    .insert({ ...input, stock_actual: 0, costo_unitario_actual: 0 })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function actualizarProducto(id: string, input: Partial<Producto>): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('productos').update(input).eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 2: Shared form component**

`app/(app)/productos/ProductoForm.tsx`:
```typescript
'use client'

import { useState } from 'react'
import type { Producto } from '@/types/database'

export interface ProductoFormValues {
  nombre: string
  categoria: string
  unidad_compra: string
  unidad_stock: string
  factor_conversion: number
  stock_minimo: number
  alicuota_iva: number
}

export function ProductoForm({
  initial,
  onSubmit,
  submitLabel,
}: {
  initial?: Partial<Producto>
  onSubmit: (values: ProductoFormValues) => Promise<void>
  submitLabel: string
}) {
  const [values, setValues] = useState<ProductoFormValues>({
    nombre: initial?.nombre ?? '',
    categoria: initial?.categoria ?? '',
    unidad_compra: initial?.unidad_compra ?? '',
    unidad_stock: initial?.unidad_stock ?? '',
    factor_conversion: initial?.factor_conversion ?? 1,
    stock_minimo: initial?.stock_minimo ?? 0,
    alicuota_iva: initial?.alicuota_iva ?? 21,
  })
  const [saving, setSaving] = useState(false)

  function set<K extends keyof ProductoFormValues>(key: K, value: ProductoFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSubmit(values)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-3">
      <input
        required
        placeholder="Nombre"
        value={values.nombre}
        onChange={(e) => set('nombre', e.target.value)}
        className="rounded border p-2"
      />
      <input
        placeholder="Categoría"
        value={values.categoria}
        onChange={(e) => set('categoria', e.target.value)}
        className="rounded border p-2"
      />
      <div className="flex gap-2">
        <input
          required
          placeholder="Unidad de compra (ej. caja)"
          value={values.unidad_compra}
          onChange={(e) => set('unidad_compra', e.target.value)}
          className="w-1/2 rounded border p-2"
        />
        <input
          required
          placeholder="Unidad de stock (ej. comprimido)"
          value={values.unidad_stock}
          onChange={(e) => set('unidad_stock', e.target.value)}
          className="w-1/2 rounded border p-2"
        />
      </div>
      <label className="text-sm text-slate-600">
        Factor de conversión (1 unidad de compra = X unidades de stock)
        <input
          required
          type="number"
          min={0.0001}
          step="any"
          value={values.factor_conversion}
          onChange={(e) => set('factor_conversion', Number(e.target.value))}
          className="mt-1 w-full rounded border p-2"
        />
      </label>
      <label className="text-sm text-slate-600">
        Stock mínimo (en unidad de stock)
        <input
          type="number"
          min={0}
          step="any"
          value={values.stock_minimo}
          onChange={(e) => set('stock_minimo', Number(e.target.value))}
          className="mt-1 w-full rounded border p-2"
        />
      </label>
      <label className="text-sm text-slate-600">
        Alícuota IVA (%)
        <input
          required
          type="number"
          min={0}
          step="any"
          value={values.alicuota_iva}
          onChange={(e) => set('alicuota_iva', Number(e.target.value))}
          className="mt-1 w-full rounded border p-2"
        />
      </label>
      <button
        type="submit"
        disabled={saving}
        className="rounded bg-slate-900 p-2 text-white disabled:opacity-50"
      >
        {saving ? 'Guardando…' : submitLabel}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: List screen with filters**

`app/(app)/productos/page.tsx`:
```typescript
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listarProductos } from '@/lib/data/productos'
import type { Producto } from '@/types/database'

export default function ProductosPage() {
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
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Productos</h1>
        <Link href="/productos/nuevo" className="rounded bg-slate-900 px-3 py-2 text-white">
          Nuevo producto
        </Link>
      </div>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={soloStockBajo}
          onChange={(e) => setSoloStockBajo(e.target.checked)}
        />
        Mostrar solo stock bajo
      </label>
      {loading ? (
        <p>Cargando…</p>
      ) : (
        <table className="w-full border-collapse rounded border text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left">
              <th className="p-2">Nombre</th>
              <th className="p-2">Categoría</th>
              <th className="p-2">Stock actual</th>
              <th className="p-2">Costo unitario</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.id} className="border-b hover:bg-slate-50">
                <td className="p-2">
                  <Link href={`/productos/${p.id}`}>{p.nombre}</Link>
                </td>
                <td className="p-2">{p.categoria}</td>
                <td className={`p-2 ${p.stock_actual <= p.stock_minimo ? 'text-red-600' : ''}`}>
                  {p.stock_actual} {p.unidad_stock}
                </td>
                <td className="p-2">${p.costo_unitario_actual.toLocaleString('es-AR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create screen**

`app/(app)/productos/nuevo/page.tsx`:
```typescript
'use client'

import { useRouter } from 'next/navigation'
import { crearProducto } from '@/lib/data/productos'
import { ProductoForm } from '../ProductoForm'

export default function NuevoProductoPage() {
  const router = useRouter()
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Nuevo producto</h1>
      <ProductoForm
        submitLabel="Crear producto"
        onSubmit={async (values) => {
          await crearProducto({ ...values, activo: true })
          router.push('/productos')
        }}
      />
    </div>
  )
}
```

- [ ] **Step 5: Edit screen**

`app/(app)/productos/[id]/page.tsx`:
```typescript
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { obtenerProducto, actualizarProducto } from '@/lib/data/productos'
import type { Producto } from '@/types/database'
import { ProductoForm } from '../ProductoForm'

export default function EditarProductoPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [producto, setProducto] = useState<Producto | null>(null)

  useEffect(() => {
    obtenerProducto(id).then(setProducto)
  }, [id])

  if (!producto) return <p>Cargando…</p>

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Editar producto</h1>
      <p className="mb-4 text-sm text-slate-500">
        Stock actual: {producto.stock_actual} {producto.unidad_stock} — Costo unitario: $
        {producto.costo_unitario_actual.toLocaleString('es-AR')}
      </p>
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

- [ ] **Step 6: Manually verify**

Run `npm run dev`, create a fractionable product (e.g. `unidad_compra="caja"`, `unidad_stock="comprimido"`, `factor_conversion=30`) and a non-fractionable one (`factor_conversion=1`). Confirm both save and the list shows stock/cost columns.

- [ ] **Step 7: Commit**

```bash
git add lib/data/productos.ts "app/(app)/productos"
git commit -m "feat: add productos CRUD screens with unit conversion fields"
```

---

### Task 9: New purchase invoice screen

**Files:**
- Create: `app/(app)/compras/nueva/page.tsx`

**Interfaces:**
- Consumes: `listarProveedores` (Task 7), `listarProductos`, `crearProducto` (Task 8), `calcularSubtotalItem`, `calcularTotalesFactura` (Task 5), `registrarFacturaCompra` (Task 6).
- Produces: working "Nueva Factura de Compra" flow — the central deliverable of this phase.

- [ ] **Step 1: Build the form**

`app/(app)/compras/nueva/page.tsx`:
```typescript
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { listarProveedores } from '@/lib/data/proveedores'
import { listarProductos, crearProducto } from '@/lib/data/productos'
import { registrarFacturaCompra, type NuevaFacturaItemInput } from '@/lib/data/facturas'
import { calcularTotalesFactura } from '@/lib/calc/factura'
import type { Proveedor, Producto, TipoComprobante } from '@/types/database'

const TIPOS_COMPROBANTE: TipoComprobante[] = [
  'Factura A',
  'Factura B',
  'Factura C',
  'Remito',
  'Nota de Credito',
]

interface ItemDraft {
  producto_id: string
  cantidad: string
  costo_unitario: string
  alicuota_iva: string
}

function emptyItem(): ItemDraft {
  return { producto_id: '', cantidad: '', costo_unitario: '', alicuota_iva: '21' }
}

export default function NuevaFacturaPage() {
  const router = useRouter()
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [proveedorId, setProveedorId] = useState('')
  const [numeroComprobante, setNumeroComprobante] = useState('')
  const [tipoComprobante, setTipoComprobante] = useState<TipoComprobante>('Factura A')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listarProveedores().then(setProveedores)
    listarProductos().then(setProductos)
  }, [])

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()])
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  async function crearProductoRapido(index: number, nombre: string) {
    const nuevo = await crearProducto({
      nombre,
      categoria: '',
      unidad_compra: 'unidad',
      unidad_stock: 'unidad',
      factor_conversion: 1,
      stock_minimo: 0,
      alicuota_iva: 21,
      activo: true,
    })
    setProductos((prev) => [...prev, nuevo])
    updateItem(index, { producto_id: nuevo.id, alicuota_iva: String(nuevo.alicuota_iva) })
  }

  const itemsParaCalculo = items
    .filter((it) => it.cantidad && it.costo_unitario)
    .map((it) => ({
      cantidad: Number(it.cantidad),
      costoUnitario: Number(it.costo_unitario),
      alicuotaIva: Number(it.alicuota_iva),
    }))
  const totales = calcularTotalesFactura(itemsParaCalculo)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!proveedorId) return setError('Elegí un proveedor.')
    const itemsValidos = items.filter((it) => it.producto_id && it.cantidad && it.costo_unitario)
    if (itemsValidos.length === 0) return setError('Agregá al menos un ítem con producto, cantidad y costo.')
    for (const it of itemsValidos) {
      if (Number(it.cantidad) <= 0) return setError('Las cantidades deben ser mayores a 0.')
      if (Number(it.costo_unitario) <= 0) return setError('Los costos deben ser mayores a 0.')
    }

    const itemsInput: NuevaFacturaItemInput[] = itemsValidos.map((it) => ({
      producto_id: it.producto_id,
      cantidad: Number(it.cantidad),
      costo_unitario: Number(it.costo_unitario),
      alicuota_iva: Number(it.alicuota_iva),
    }))
    const totalesFinales = calcularTotalesFactura(
      itemsInput.map((it) => ({
        cantidad: it.cantidad,
        costoUnitario: it.costo_unitario,
        alicuotaIva: it.alicuota_iva,
      }))
    )

    setSaving(true)
    try {
      const { id } = await registrarFacturaCompra({
        proveedor_id: proveedorId,
        numero_comprobante: numeroComprobante,
        tipo_comprobante: tipoComprobante,
        fecha,
        subtotal: totalesFinales.subtotal,
        iva_total: totalesFinales.ivaTotal,
        total: totalesFinales.total,
        items: itemsInput,
      })
      router.push(`/compras/${id}`)
    } catch (err) {
      setError('No se pudo guardar la factura. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Nueva factura de compra</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <select
            required
            value={proveedorId}
            onChange={(e) => setProveedorId(e.target.value)}
            className="rounded border p-2"
          >
            <option value="">Proveedor…</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <select
            value={tipoComprobante}
            onChange={(e) => setTipoComprobante(e.target.value as TipoComprobante)}
            className="rounded border p-2"
          >
            {TIPOS_COMPROBANTE.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            required
            placeholder="Número de comprobante"
            value={numeroComprobante}
            onChange={(e) => setNumeroComprobante(e.target.value)}
            className="rounded border p-2"
          />
          <input
            required
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="rounded border p-2"
          />
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left">
              <th className="p-2">Producto</th>
              <th className="p-2">Cantidad</th>
              <th className="p-2">Costo unitario</th>
              <th className="p-2">IVA %</th>
              <th className="p-2">Subtotal</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const subtotalItem =
                item.cantidad && item.costo_unitario
                  ? Number(item.cantidad) * Number(item.costo_unitario)
                  : 0
              return (
                <tr key={index} className="border-b">
                  <td className="p-2">
                    <input
                      list={`productos-list`}
                      placeholder="Buscar o crear producto…"
                      value={
                        productos.find((p) => p.id === item.producto_id)?.nombre ?? ''
                      }
                      onChange={(e) => {
                        const match = productos.find((p) => p.nombre === e.target.value)
                        if (match) {
                          updateItem(index, {
                            producto_id: match.id,
                            alicuota_iva: String(match.alicuota_iva),
                          })
                        } else if (e.target.value.trim().length > 2) {
                          crearProductoRapido(index, e.target.value.trim())
                        }
                      }}
                      className="w-full rounded border p-1"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.cantidad}
                      onChange={(e) => updateItem(index, { cantidad: e.target.value })}
                      className="w-20 rounded border p-1"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.costo_unitario}
                      onChange={(e) => updateItem(index, { costo_unitario: e.target.value })}
                      className="w-24 rounded border p-1"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.alicuota_iva}
                      onChange={(e) => updateItem(index, { alicuota_iva: e.target.value })}
                      className="w-16 rounded border p-1"
                    />
                  </td>
                  <td className="p-2">${subtotalItem.toLocaleString('es-AR')}</td>
                  <td className="p-2">
                    <button type="button" onClick={() => removeItem(index)} className="text-red-600">
                      Quitar
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <datalist id="productos-list">
          {productos.map((p) => (
            <option key={p.id} value={p.nombre} />
          ))}
        </datalist>

        <button type="button" onClick={addItem} className="w-fit rounded border px-3 py-1 text-sm">
          + Agregar ítem
        </button>

        <div className="ml-auto w-64 rounded border p-3 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>${totales.subtotal.toLocaleString('es-AR')}</span>
          </div>
          <div className="flex justify-between">
            <span>IVA</span>
            <span>${totales.ivaTotal.toLocaleString('es-AR')}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span>${totales.total.toLocaleString('es-AR')}</span>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-fit rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar factura'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Manually verify**

Run `npm run dev`, go to `/compras/nueva`. Add a supplier and two products beforehand (one fractionable, one not). Load an invoice with both, confirm totals update live, save, and confirm redirect to the invoice detail (built in Task 10 — if that page doesn't exist yet, verify via the `productos` list that `stock_actual` and `costo_unitario_actual` updated correctly for both products).

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/compras/nueva"
git commit -m "feat: add new purchase invoice screen"
```

---

### Task 10: Invoice list, detail, and annulment

**Files:**
- Create: `app/(app)/compras/page.tsx`, `app/(app)/compras/[id]/page.tsx`

**Interfaces:**
- Consumes: `listarFacturas`, `obtenerFacturaConItems`, `anularFactura` (Task 6), `listarProveedores` (Task 7), `listarProductos` (Task 8).

- [ ] **Step 1: List screen with filters**

`app/(app)/compras/page.tsx`:
```typescript
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listarFacturas } from '@/lib/data/facturas'
import { listarProveedores } from '@/lib/data/proveedores'
import type { FacturaCompra, Proveedor } from '@/types/database'

export default function ComprasPage() {
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
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Compras</h1>
        <Link href="/compras/nueva" className="rounded bg-slate-900 px-3 py-2 text-white">
          Nueva factura
        </Link>
      </div>
      <select
        value={proveedorId}
        onChange={(e) => setProveedorId(e.target.value)}
        className="mb-3 rounded border p-2"
      >
        <option value="">Todos los proveedores</option>
        {proveedores.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </select>
      <ul className="divide-y rounded border">
        {facturas.map((f) => {
          const proveedor = proveedores.find((p) => p.id === f.proveedor_id)
          return (
            <li key={f.id} className="p-3 hover:bg-slate-50">
              <Link href={`/compras/${f.id}`} className="flex justify-between">
                <span>
                  {f.fecha} — {proveedor?.nombre ?? '—'} — {f.tipo_comprobante} {f.numero_comprobante}
                  {f.estado === 'anulada' && (
                    <span className="ml-2 text-xs text-red-600">ANULADA</span>
                  )}
                </span>
                <span>${f.total.toLocaleString('es-AR')}</span>
              </Link>
            </li>
          )
        })}
        {facturas.length === 0 && <li className="p-3 text-slate-500">Sin facturas aún.</li>}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Detail screen with annul action**

`app/(app)/compras/[id]/page.tsx`:
```typescript
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { obtenerFacturaConItems, anularFactura } from '@/lib/data/facturas'
import { obtenerProveedor } from '@/lib/data/proveedores'
import { listarProductos } from '@/lib/data/productos'
import type { FacturaCompra, ItemFactura, Proveedor, Producto } from '@/types/database'

export default function DetalleFacturaPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [factura, setFactura] = useState<FacturaCompra | null>(null)
  const [items, setItems] = useState<ItemFactura[]>([])
  const [proveedor, setProveedor] = useState<Proveedor | null>(null)
  const [productos, setProductos] = useState<Producto[]>([])
  const [anulando, setAnulando] = useState(false)

  useEffect(() => {
    obtenerFacturaConItems(id).then(({ factura, items }) => {
      setFactura(factura)
      setItems(items)
      obtenerProveedor(factura.proveedor_id).then(setProveedor)
    })
    listarProductos().then(setProductos)
  }, [id])

  if (!factura) return <p>Cargando…</p>

  async function handleAnular() {
    if (!confirm('¿Anular esta factura? Se revertirá el stock que sumó.')) return
    setAnulando(true)
    try {
      await anularFactura(id)
      router.refresh()
      const { factura: actualizada } = await obtenerFacturaConItems(id)
      setFactura(actualizada)
    } finally {
      setAnulando(false)
    }
  }

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold">
        {factura.tipo_comprobante} {factura.numero_comprobante}
        {factura.estado === 'anulada' && <span className="ml-2 text-sm text-red-600">ANULADA</span>}
      </h1>
      <p className="mb-4 text-sm text-slate-500">
        {proveedor?.nombre} — {factura.fecha}
      </p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-slate-50 text-left">
            <th className="p-2">Producto</th>
            <th className="p-2">Cantidad</th>
            <th className="p-2">Costo unitario</th>
            <th className="p-2">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b">
              <td className="p-2">{productos.find((p) => p.id === item.producto_id)?.nombre}</td>
              <td className="p-2">{item.cantidad}</td>
              <td className="p-2">${item.costo_unitario.toLocaleString('es-AR')}</td>
              <td className="p-2">${item.subtotal.toLocaleString('es-AR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto mt-4 w-64 rounded border p-3 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>${factura.subtotal.toLocaleString('es-AR')}</span>
        </div>
        <div className="flex justify-between">
          <span>IVA</span>
          <span>${factura.iva_total.toLocaleString('es-AR')}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <span>${factura.total.toLocaleString('es-AR')}</span>
        </div>
      </div>
      {factura.estado === 'cargada' && (
        <button
          onClick={handleAnular}
          disabled={anulando}
          className="mt-4 rounded border border-red-600 px-4 py-2 text-red-600 disabled:opacity-50"
        >
          {anulando ? 'Anulando…' : 'Anular factura'}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Manually verify**

From `/compras`, open the invoice created in Task 9, confirm items and totals match. Click "Anular factura", confirm the badge shows ANULADA and the related product's `stock_actual` (visible on `/productos`) drops back down by the annulled quantity.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/compras/page.tsx" "app/(app)/compras/[id]"
git commit -m "feat: add invoice list, detail, and annulment screens"
```

---

### Task 11: Stock — manual adjustment RPC and screen

**Files:**
- Create: `supabase/migrations/0003_ajustar_stock_manual.sql`, `lib/data/stock.ts`, `app/(app)/stock/page.tsx`

**Interfaces:**
- Consumes: `listarProductos` (Task 8).
- Produces: SQL function `ajustar_stock_manual(p_producto_id uuid, p_cantidad numeric, p_motivo text) returns void`; `ajustarStockManual(productoId: string, cantidad: number, motivo: string): Promise<void>` in `lib/data/stock.ts`.

- [ ] **Step 1: Write the RPC migration**

`supabase/migrations/0003_ajustar_stock_manual.sql`:
```sql
create or replace function ajustar_stock_manual(
  p_producto_id uuid,
  p_cantidad numeric,
  p_motivo text
)
returns void
language plpgsql
security definer
as $$
begin
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'El motivo del ajuste es obligatorio';
  end if;

  insert into movimientos_stock (producto_id, tipo, cantidad, motivo, usuario_id)
  values (p_producto_id, 'ajuste_manual', p_cantidad, p_motivo, auth.uid());

  update productos
  set stock_actual = stock_actual + p_cantidad
  where id = p_producto_id;
end;
$$;
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```
Expected: CLI reports migration `0003_ajustar_stock_manual.sql` applied.

- [ ] **Step 3: Data layer**

`lib/data/stock.ts`:
```typescript
import { createClient } from '@/lib/supabase/client'

export async function ajustarStockManual(
  productoId: string,
  cantidad: number,
  motivo: string
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('ajustar_stock_manual', {
    p_producto_id: productoId,
    p_cantidad: cantidad,
    p_motivo: motivo,
  })
  if (error) throw error
}
```

- [ ] **Step 4: Stock screen**

`app/(app)/stock/page.tsx`:
```typescript
'use client'

import { useEffect, useState } from 'react'
import { listarProductos } from '@/lib/data/productos'
import { ajustarStockManual } from '@/lib/data/stock'
import type { Producto } from '@/types/database'

export default function StockPage() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [ajusteAbierto, setAjusteAbierto] = useState<string | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)

  function cargar() {
    listarProductos().then(setProductos)
  }

  useEffect(cargar, [])

  async function handleAjustar(productoId: string) {
    setError(null)
    if (!motivo.trim()) return setError('El motivo es obligatorio.')
    if (!cantidad || Number(cantidad) === 0) return setError('Ingresá una cantidad distinta de 0.')
    await ajustarStockManual(productoId, Number(cantidad), motivo.trim())
    setAjusteAbierto(null)
    setCantidad('')
    setMotivo('')
    cargar()
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Stock</h1>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-slate-50 text-left">
            <th className="p-2">Producto</th>
            <th className="p-2">Stock actual</th>
            <th className="p-2">Stock mínimo</th>
            <th className="p-2">Valor (costo × stock)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {productos.map((p) => (
            <>
              <tr key={p.id} className="border-b">
                <td className="p-2">{p.nombre}</td>
                <td className={`p-2 ${p.stock_actual <= p.stock_minimo ? 'font-semibold text-red-600' : ''}`}>
                  {p.stock_actual} {p.unidad_stock}
                  {p.stock_actual <= p.stock_minimo && ' ⚠️'}
                </td>
                <td className="p-2">{p.stock_minimo}</td>
                <td className="p-2">
                  ${(p.stock_actual * p.costo_unitario_actual).toLocaleString('es-AR')}
                </td>
                <td className="p-2">
                  <button
                    onClick={() => setAjusteAbierto(ajusteAbierto === p.id ? null : p.id)}
                    className="text-sm text-slate-600 underline"
                  >
                    Ajustar
                  </button>
                </td>
              </tr>
              {ajusteAbierto === p.id && (
                <tr className="border-b bg-slate-50">
                  <td colSpan={5} className="p-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="text-sm">
                        Cantidad (+/- en {p.unidad_stock})
                        <input
                          type="number"
                          step="any"
                          value={cantidad}
                          onChange={(e) => setCantidad(e.target.value)}
                          className="mt-1 block w-32 rounded border p-1"
                        />
                      </label>
                      <label className="text-sm">
                        Motivo
                        <input
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                          className="mt-1 block w-64 rounded border p-1"
                        />
                      </label>
                      <button
                        onClick={() => handleAjustar(p.id)}
                        className="rounded bg-slate-900 px-3 py-1 text-white"
                      >
                        Confirmar
                      </button>
                    </div>
                    {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 5: Manually verify**

Go to `/stock`, confirm products with `stock_actual <= stock_minimo` are flagged. Adjust a product's stock with a reason, confirm the row updates and rejecting an empty reason shows the error.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0003_ajustar_stock_manual.sql lib/data/stock.ts "app/(app)/stock"
git commit -m "feat: add stock screen with low-stock alerts and manual adjustment"
```

---

### Task 12: Reports — spend and stock value

**Files:**
- Create: `lib/data/reportes.ts`, `app/(app)/reportes/page.tsx`

**Interfaces:**
- Consumes: `listarFacturas` (Task 6), `listarProveedores` (Task 7), `listarProductos` (Task 8).
- Produces: `calcularGastoPorProveedor(facturas: FacturaCompra[], proveedores: Proveedor[]): { proveedor: string; total: number }[]`, `calcularValorStock(productos: Producto[]): number` — pure functions, unit tested.

- [ ] **Step 1: Write the failing tests**

`lib/data/reportes.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { calcularGastoPorProveedor, calcularValorStock } from './reportes'
import type { FacturaCompra, Proveedor, Producto } from '@/types/database'

function proveedor(id: string, nombre: string): Proveedor {
  return { id, nombre, cuit: null, telefono: null, email: null, direccion: null, notas: null, created_at: '' }
}

function factura(proveedorId: string, total: number, estado: 'cargada' | 'anulada' = 'cargada'): FacturaCompra {
  return {
    id: crypto.randomUUID(),
    proveedor_id: proveedorId,
    numero_comprobante: '0001',
    tipo_comprobante: 'Factura A',
    fecha: '2026-09-01',
    subtotal: total,
    iva_total: 0,
    total,
    estado,
    archivo_adjunto: null,
    notas: null,
    created_at: '',
    created_by: null,
  }
}

describe('calcularGastoPorProveedor', () => {
  it('sums invoice totals grouped by supplier, excluding annulled invoices', () => {
    const proveedores = [proveedor('p1', 'Proveedor Uno'), proveedor('p2', 'Proveedor Dos')]
    const facturas = [
      factura('p1', 1000),
      factura('p1', 500),
      factura('p2', 2000),
      factura('p1', 9999, 'anulada'),
    ]
    const result = calcularGastoPorProveedor(facturas, proveedores)
    expect(result).toEqual(
      expect.arrayContaining([
        { proveedor: 'Proveedor Uno', total: 1500 },
        { proveedor: 'Proveedor Dos', total: 2000 },
      ])
    )
  })
})

describe('calcularValorStock', () => {
  function producto(stock: number, costo: number): Producto {
    return {
      id: crypto.randomUUID(),
      nombre: 'x',
      categoria: null,
      unidad_compra: 'u',
      unidad_stock: 'u',
      factor_conversion: 1,
      stock_actual: stock,
      stock_minimo: 0,
      costo_unitario_actual: costo,
      alicuota_iva: 21,
      activo: true,
      created_at: '',
    }
  }

  it('sums stock quantity times current unit cost across products', () => {
    const productos = [producto(10, 100), producto(5, 50)]
    expect(calcularValorStock(productos)).toBe(1000 + 250)
  })

  it('returns 0 for no products', () => {
    expect(calcularValorStock([])).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './reportes'`.

- [ ] **Step 3: Implement**

`lib/data/reportes.ts`:
```typescript
import type { FacturaCompra, Proveedor, Producto } from '@/types/database'

export function calcularGastoPorProveedor(
  facturas: FacturaCompra[],
  proveedores: Proveedor[]
): { proveedor: string; total: number }[] {
  const totalesPorId = new Map<string, number>()
  for (const f of facturas) {
    if (f.estado === 'anulada') continue
    totalesPorId.set(f.proveedor_id, (totalesPorId.get(f.proveedor_id) ?? 0) + f.total)
  }
  return Array.from(totalesPorId.entries()).map(([proveedorId, total]) => ({
    proveedor: proveedores.find((p) => p.id === proveedorId)?.nombre ?? 'Desconocido',
    total,
  }))
}

export function calcularValorStock(productos: Producto[]): number {
  return productos.reduce((acc, p) => acc + p.stock_actual * p.costo_unitario_actual, 0)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Reports screen**

`app/(app)/reportes/page.tsx`:
```typescript
'use client'

import { useEffect, useState } from 'react'
import { listarFacturas } from '@/lib/data/facturas'
import { listarProveedores } from '@/lib/data/proveedores'
import { listarProductos } from '@/lib/data/productos'
import { calcularGastoPorProveedor, calcularValorStock } from '@/lib/data/reportes'
import type { FacturaCompra, Proveedor, Producto } from '@/types/database'

export default function ReportesPage() {
  const [facturas, setFacturas] = useState<FacturaCompra[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos, setProductos] = useState<Producto[]>([])

  useEffect(() => {
    listarFacturas().then(setFacturas)
    listarProveedores().then(setProveedores)
    listarProductos().then(setProductos)
  }, [])

  const gastoPorProveedor = calcularGastoPorProveedor(facturas, proveedores)
  const valorStock = calcularValorStock(productos)
  const productosStockBajo = productos.filter((p) => p.stock_actual <= p.stock_minimo)

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Reportes</h1>

      <section>
        <h2 className="mb-2 font-semibold">Valor total del stock actual</h2>
        <p className="text-2xl">${valorStock.toLocaleString('es-AR')}</p>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Gasto en compras por proveedor</h2>
        <ul className="divide-y rounded border">
          {gastoPorProveedor.map((g) => (
            <li key={g.proveedor} className="flex justify-between p-2">
              <span>{g.proveedor}</span>
              <span>${g.total.toLocaleString('es-AR')}</span>
            </li>
          ))}
          {gastoPorProveedor.length === 0 && <li className="p-2 text-slate-500">Sin compras aún.</li>}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Productos con stock bajo</h2>
        <ul className="divide-y rounded border">
          {productosStockBajo.map((p) => (
            <li key={p.id} className="p-2">
              {p.nombre}: {p.stock_actual} {p.unidad_stock} (mínimo {p.stock_minimo})
            </li>
          ))}
          {productosStockBajo.length === 0 && (
            <li className="p-2 text-slate-500">Ningún producto está bajo el mínimo.</li>
          )}
        </ul>
      </section>
    </div>
  )
}
```

- [ ] **Step 6: Manually verify**

Go to `/reportes`, confirm spend-by-supplier matches the invoices loaded earlier, stock value matches `sum(stock_actual * costo_unitario_actual)` seen on `/stock`, and low-stock products match `/productos`.

- [ ] **Step 7: Commit**

```bash
git add lib/data/reportes.ts lib/data/reportes.test.ts "app/(app)/reportes"
git commit -m "feat: add spend and stock value reports"
```

---

### Task 13: Deployment

**Files:**
- Create: none (configuration only)

**Interfaces:**
- Produces: a live URL serving the app, connected to the production Supabase project.

- [ ] **Step 1: Push the repository to a remote**

Create a private GitHub repository (ask the user which account/org), then:
```bash
git remote add origin <repo-url>
git push -u origin main
```

- [ ] **Step 2: Import into Vercel**

In the Vercel dashboard, import the GitHub repo. Set environment variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (same values as `.env.local`) in the Vercel project settings.

- [ ] **Step 3: Deploy and verify**

Trigger the deploy, open the resulting URL on a phone browser, log in, and confirm `/proveedores`, `/productos`, `/compras/nueva`, `/stock`, and `/reportes` all load and work end-to-end against the production Supabase project.

- [ ] **Step 4: Create the 2-5 real user accounts**

In the Supabase Auth dashboard, invite/create accounts for each team member who will use the system, and share login credentials securely (not over an insecure channel).

---

## Self-Review Notes

- **Spec coverage:** every Fase-1 spec section maps to a task — data model (Task 3), login/single-access-level (Task 4), manual invoice loading with live totals (Tasks 5, 9), stock/cost auto-update (Task 6), invoice list/detail/no-edit-only-annul (Task 10), stock screen with alerts and audited manual adjustment (Task 11), reports on spend and stock value (Task 12), quick product creation from the invoice form (Task 9), file attachment support via Storage (`archivo_adjunto` field wired through Tasks 3, 6, 9 — upload UI can be added as a follow-up without schema changes).
- **Type consistency:** `Producto`, `Proveedor`, `FacturaCompra`, `ItemFactura`, `MovimientoStock` field names are defined once in Task 3 and reused verbatim in every later task's code.
- **Atomicity:** invoice registration, annulment, and manual stock adjustment are each a single Postgres RPC call — no task leaves stock/cost updates as a separate client-side step that could partially fail.
