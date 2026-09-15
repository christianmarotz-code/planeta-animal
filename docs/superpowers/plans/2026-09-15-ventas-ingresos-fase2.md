# Fase 2 — Ventas / Ingresos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the 2-5 logged-in users of Planeta Animal register sales — petshop products and services (consultas, vacunas, cirugías, lavado de animales) — with automatic stock deduction, margin tracking, and reports that cross income against the existing expense/purchase data (rentabilidad por rama, frecuencia de uso de servicios como el lavadero).

**Architecture:** Extends the existing Next.js (App Router, TypeScript) + Supabase project — no new infrastructure. Follows the same conventions as Fase 1: atomic multi-table writes (registering a sale, annulling one) go through Postgres RPC functions (`security definer`) so `items_venta`, `movimientos_stock`, and `productos.stock_actual` never drift out of sync; pure calculation logic lives in `lib/calc/`, unit-tested in isolation from Supabase.

**Tech Stack:** Next.js 16 (App Router, TypeScript), Tailwind CSS, Supabase (Postgres + Auth), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-15-ventas-ingresos-fase2-design.md`

## Global Constraints

- A single `medio_pago` (`'efectivo'|'tarjeta'|'transferencia'`) per venta — no split payments this phase.
- `cliente_id` is nullable on `ventas` — sales are not required to identify a customer.
- Servicios have no stock/cost tracking: their margin is 100% of `precio_unitario`. Only `tipo='producto'` items touch `productos.stock_actual` and carry a `costo_unitario_snapshot`.
- Sale prices (`productos.precio_venta`, `servicios.precio`) are treated as final, IVA-inclusive prices — this phase does not break out IVA per item the way purchase invoices do. `ventas.iva_total` is always persisted as `0` and `total = subtotal`; the column exists (matching the spec's data model) for a future phase that needs the breakdown, but nothing in this phase computes a non-zero value for it.
- A confirmed venta is never edited in place — only annulled (`estado = 'anulada'`), preserving history, exactly like `facturas_compra`.
- Registering a venta with insufficient stock on any `tipo='producto'` item aborts the entire transaction — no partial sales, no negative stock.
- Direct table writes to `servicios`, `clientes`, `ventas`, `items_venta` are admin-only via RLS (same criterion as `productos`/`facturas_compra` in migration `0015`). The `registrar_venta`/`anular_venta` RPCs are `security definer` and bypass that restriction, so any authenticated user (admin or empleado) can register or annul a sale through them — mirroring how `registrar_factura_compra` already works for empleados today.
- Responsive UI, same visual language as the rest of the app (Tailwind utility classes already in use: `rise`, `text-ink`/`text-ink-soft`/`text-ink-faint`, `text-negative`, `border-line`, `bg-surface`, `rounded-[var(--r-sm)]`, `pill-btn`, `chip`/`chip down`).

---

## File Structure

```
supabase/migrations/
  0016_ventas_schema.sql            # servicios, clientes, ventas, items_venta tables + RLS; extends movimientos_stock
  0017_registrar_venta.sql          # registrar_venta + anular_venta RPCs

types/database.ts                   # extended: Servicio, Cliente, Venta, ItemVenta, MedioPago, EstadoVenta,
                                     # TipoItemVenta, TipoMovimientoStock (extended), Database.Tables additions

lib/calc/venta.ts                   # pure calculation functions (unit tested)
lib/calc/venta.test.ts

lib/data/servicios.ts               # CRUD against `servicios`
lib/data/clientes.ts                # CRUD against `clientes`
lib/data/ventas.ts                  # venta CRUD + calls to registrar_venta/anular_venta RPCs

lib/data/reportes.ts                # extended: ingreso, rentabilidad por rama, ventas por medio de pago,
                                     # frecuencia de servicio por semana/mes
lib/data/reportes.test.ts           # extended

app/(app)/servicios/page.tsx        # list
app/(app)/servicios/nuevo/page.tsx  # create
app/(app)/servicios/ServicioForm.tsx

app/(app)/ventas/page.tsx           # list + filters
app/(app)/ventas/nueva/page.tsx     # new sale form — the central deliverable
app/(app)/ventas/[id]/page.tsx      # detail + anular

app/(app)/page.tsx                  # dashboard — add ingreso/neto cards
app/(app)/reportes/page.tsx         # add frecuencia de lavado chart
components/Sidebar.tsx              # add Ventas + Servicios nav entries
```

---

### Task 1: Database schema, RLS, and TS types

**Files:**
- Create: `supabase/migrations/0016_ventas_schema.sql`
- Modify: `types/database.ts`

**Interfaces:**
- Consumes: existing `productos`, `perfiles`, `movimientos_stock` tables (Fase 1).
- Produces: tables `servicios`, `clientes`, `ventas`, `items_venta`; extends `movimientos_stock` with `tipo='salida_venta'` and a nullable `venta_id` column. TS types `Servicio`, `Cliente`, `Venta`, `ItemVenta`, `MedioPago`, `EstadoVenta`, `TipoItemVenta` — the contract every later task's data-layer code relies on.

- [ ] **Step 1: Write the schema migration**

`supabase/migrations/0016_ventas_schema.sql`:
```sql
create table servicios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text,
  rama text check (rama in ('clinica', 'petshop')),
  precio numeric not null default 0 check (precio >= 0),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  email text,
  created_at timestamptz not null default now()
);

create table ventas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id),
  fecha date not null,
  medio_pago text not null check (medio_pago in ('efectivo', 'tarjeta', 'transferencia')),
  subtotal numeric not null check (subtotal >= 0),
  iva_total numeric not null default 0 check (iva_total >= 0),
  total numeric not null check (total >= 0),
  estado text not null default 'confirmada' check (estado in ('confirmada', 'anulada')),
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table items_venta (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references ventas(id) on delete cascade,
  tipo text not null check (tipo in ('producto', 'servicio')),
  producto_id uuid references productos(id),
  servicio_id uuid references servicios(id),
  cantidad numeric not null check (cantidad > 0),
  precio_unitario numeric not null check (precio_unitario >= 0),
  costo_unitario_snapshot numeric,
  subtotal numeric not null,
  constraint items_venta_tipo_item_check check (
    (tipo = 'producto' and producto_id is not null and servicio_id is null) or
    (tipo = 'servicio' and servicio_id is not null and producto_id is null)
  )
);

-- Extiende movimientos_stock (Fase 1) para que una venta de producto pueda
-- generar su propio movimiento, trazable de vuelta a la venta.
alter table movimientos_stock add column venta_id uuid references ventas(id);
alter table movimientos_stock drop constraint movimientos_stock_tipo_check;
alter table movimientos_stock add constraint movimientos_stock_tipo_check
  check (tipo in ('entrada_compra', 'ajuste_manual', 'salida_venta'));

alter table servicios enable row level security;
alter table clientes enable row level security;
alter table ventas enable row level security;
alter table items_venta enable row level security;

-- Mismo criterio que 0015 (productos/facturas_compra): lectura abierta a
-- cualquier usuario logueado, escritura DIRECTA a la tabla restringida a
-- administradores. El registro y la anulación de ventas del día a día no
-- pasan por acá: usan registrar_venta/anular_venta (security definer,
-- Task 3), que corren con los privilegios de su dueño y no se ven
-- afectadas por estas políticas — igual que registrar_factura_compra hoy.
create policy "servicios_lectura" on servicios
  for select to authenticated using (true);
create policy "servicios_insertar_admin" on servicios
  for insert to authenticated
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));
create policy "servicios_actualizar_admin" on servicios
  for update to authenticated
  using (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'))
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));
create policy "servicios_borrar_admin" on servicios
  for delete to authenticated
  using (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));

create policy "clientes_lectura" on clientes
  for select to authenticated using (true);
create policy "clientes_insertar_admin" on clientes
  for insert to authenticated
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));
create policy "clientes_actualizar_admin" on clientes
  for update to authenticated
  using (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'))
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));
create policy "clientes_borrar_admin" on clientes
  for delete to authenticated
  using (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));

create policy "ventas_lectura" on ventas
  for select to authenticated using (true);
create policy "ventas_insertar_admin" on ventas
  for insert to authenticated
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));
create policy "ventas_actualizar_admin" on ventas
  for update to authenticated
  using (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'))
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));
create policy "ventas_borrar_admin" on ventas
  for delete to authenticated
  using (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));

create policy "items_venta_lectura" on items_venta
  for select to authenticated using (true);
create policy "items_venta_insertar_admin" on items_venta
  for insert to authenticated
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));
create policy "items_venta_actualizar_admin" on items_venta
  for update to authenticated
  using (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'))
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));
create policy "items_venta_borrar_admin" on items_venta
  for delete to authenticated
  using (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```
Expected: CLI reports `0016_ventas_schema.sql` applied.

- [ ] **Step 3: Extend the TS types**

In `types/database.ts`, add after the `Perfil` interface and before the `Database` interface:
```typescript
export type MedioPago = 'efectivo' | 'tarjeta' | 'transferencia'
export type EstadoVenta = 'confirmada' | 'anulada'
export type TipoItemVenta = 'producto' | 'servicio'

export interface Servicio {
  id: string
  nombre: string
  categoria: string | null
  rama: Rama | null
  precio: number
  activo: boolean
  created_at: string
}

export interface Cliente {
  id: string
  nombre: string
  telefono: string | null
  email: string | null
  created_at: string
}

export interface Venta {
  id: string
  cliente_id: string | null
  fecha: string
  medio_pago: MedioPago
  subtotal: number
  iva_total: number
  total: number
  estado: EstadoVenta
  notas: string | null
  created_at: string
  created_by: string | null
}

export interface ItemVenta {
  id: string
  venta_id: string
  tipo: TipoItemVenta
  producto_id: string | null
  servicio_id: string | null
  cantidad: number
  precio_unitario: number
  costo_unitario_snapshot: number | null
  subtotal: number
}
```

Change `TipoMovimientoStock` and `MovimientoStock`:
```typescript
export type TipoMovimientoStock = 'entrada_compra' | 'ajuste_manual' | 'salida_venta'

export interface MovimientoStock {
  id: string
  producto_id: string
  tipo: TipoMovimientoStock
  cantidad: number
  fecha: string
  factura_id: string | null
  venta_id: string | null
  motivo: string | null
  usuario_id: string | null
}
```

In the `Database.public.Tables` object, add:
```typescript
      servicios: { Row: Servicio; Insert: Partial<Servicio>; Update: Partial<Servicio> }
      clientes: { Row: Cliente; Insert: Partial<Cliente>; Update: Partial<Cliente> }
      ventas: { Row: Venta; Insert: Partial<Venta>; Update: Partial<Venta> }
      items_venta: { Row: ItemVenta; Insert: Partial<ItemVenta>; Update: Partial<ItemVenta> }
```

- [ ] **Step 4: Verify the project still builds**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0016_ventas_schema.sql types/database.ts
git commit -m "feat: add ventas/servicios/clientes schema, RLS, and TS types"
```

---

### Task 2: Sale calculation logic (TDD)

**Files:**
- Create: `lib/calc/venta.ts`, `lib/calc/venta.test.ts`

**Interfaces:**
- Produces:
  - `calcularSubtotalItemVenta(cantidad: number, precioUnitario: number): number`
  - `calcularTotalesVenta(items: { cantidad: number; precioUnitario: number }[]): { subtotal: number; ivaTotal: number; total: number }`
  - `calcularMargenItemVenta(item: { tipo: 'producto' | 'servicio'; cantidad: number; precioUnitario: number; costoUnitarioSnapshot: number | null }): number`
  - `calcularMargenTotalVenta(items: { tipo: 'producto' | 'servicio'; cantidad: number; precioUnitario: number; costoUnitarioSnapshot: number | null }[]): number`
- Consumed by: Task 6 (nueva venta screen, live totals) and mirrored in Task 3's SQL RPC (same formulas, so both layers agree).

- [ ] **Step 1: Write the failing tests**

`lib/calc/venta.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import {
  calcularSubtotalItemVenta,
  calcularTotalesVenta,
  calcularMargenItemVenta,
  calcularMargenTotalVenta,
} from './venta'

describe('calcularSubtotalItemVenta', () => {
  it('multiplies quantity by unit price', () => {
    expect(calcularSubtotalItemVenta(3, 500)).toBe(1500)
  })
})

describe('calcularTotalesVenta', () => {
  it('sums subtotal across items, IVA always 0 this phase', () => {
    const items = [
      { cantidad: 2, precioUnitario: 500 },
      { cantidad: 1, precioUnitario: 3000 },
    ]
    const result = calcularTotalesVenta(items)
    expect(result.subtotal).toBe(4000)
    expect(result.ivaTotal).toBe(0)
    expect(result.total).toBe(4000)
  })

  it('returns all zeros for an empty item list', () => {
    expect(calcularTotalesVenta([])).toEqual({ subtotal: 0, ivaTotal: 0, total: 0 })
  })
})

describe('calcularMargenItemVenta', () => {
  it('subtracts snapshotted cost for a producto item', () => {
    const margen = calcularMargenItemVenta({
      tipo: 'producto',
      cantidad: 3,
      precioUnitario: 1000,
      costoUnitarioSnapshot: 600,
    })
    expect(margen).toBe(1200) // (1000 - 600) * 3
  })

  it('treats the full price as margin for a servicio item', () => {
    const margen = calcularMargenItemVenta({
      tipo: 'servicio',
      cantidad: 2,
      precioUnitario: 5000,
      costoUnitarioSnapshot: null,
    })
    expect(margen).toBe(10000)
  })
})

describe('calcularMargenTotalVenta', () => {
  it('sums margin across mixed producto/servicio items', () => {
    const total = calcularMargenTotalVenta([
      { tipo: 'producto', cantidad: 3, precioUnitario: 1000, costoUnitarioSnapshot: 600 },
      { tipo: 'servicio', cantidad: 1, precioUnitario: 5000, costoUnitarioSnapshot: null },
    ])
    expect(total).toBe(1200 + 5000)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './venta'`.

- [ ] **Step 3: Implement**

`lib/calc/venta.ts`:
```typescript
export function calcularSubtotalItemVenta(cantidad: number, precioUnitario: number): number {
  return cantidad * precioUnitario
}

export function calcularTotalesVenta(
  items: { cantidad: number; precioUnitario: number }[]
): { subtotal: number; ivaTotal: number; total: number } {
  const subtotal = items.reduce(
    (acc, item) => acc + calcularSubtotalItemVenta(item.cantidad, item.precioUnitario),
    0
  )
  // Los precios de venta ya son finales (IVA incluido) en esta fase — no se
  // discrimina IVA por ítem como en las facturas de compra.
  return { subtotal, ivaTotal: 0, total: subtotal }
}

export interface ItemVentaMargen {
  tipo: 'producto' | 'servicio'
  cantidad: number
  precioUnitario: number
  costoUnitarioSnapshot: number | null
}

export function calcularMargenItemVenta(item: ItemVentaMargen): number {
  const ingreso = calcularSubtotalItemVenta(item.cantidad, item.precioUnitario)
  if (item.tipo === 'producto') {
    const costo = item.costoUnitarioSnapshot ?? 0
    return ingreso - item.cantidad * costo
  }
  return ingreso
}

export function calcularMargenTotalVenta(items: ItemVentaMargen[]): number {
  return items.reduce((acc, item) => acc + calcularMargenItemVenta(item), 0)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/calc/venta.ts lib/calc/venta.test.ts
git commit -m "feat: add unit-tested sale calculation functions"
```

---

### Task 3: Atomic sale registration (RPC + data layer)

**Files:**
- Create: `supabase/migrations/0017_registrar_venta.sql`, `lib/data/ventas.ts`

**Interfaces:**
- Consumes: `Venta`, `ItemVenta`, `MedioPago` types (Task 1).
- Produces:
  - SQL function `registrar_venta(payload jsonb) returns uuid` — inserts the venta, its items, one `movimientos_stock` row per `tipo='producto'` item, and decrements `productos.stock_actual`, all in one transaction; raises (and rolls back) if any producto item has insufficient stock.
  - SQL function `anular_venta(p_venta_id uuid) returns void` — sets `estado = 'anulada'` and reverses the stock movements.
  - `registrarVenta(input: NuevaVentaInput): Promise<{ id: string }>`
  - `listarVentas(filtros?: { clienteId?: string; medioPago?: MedioPago; desde?: string; hasta?: string }): Promise<Venta[]>`
  - `obtenerVentaConItems(id: string): Promise<{ venta: Venta; items: ItemVenta[] }>`
  - `anularVenta(id: string): Promise<void>`

- [ ] **Step 1: Write the RPC migration**

`supabase/migrations/0017_registrar_venta.sql`:
```sql
create or replace function registrar_venta(payload jsonb)
returns uuid
language plpgsql
security definer
as $$
declare
  v_venta_id uuid;
  v_item jsonb;
  v_tipo text;
  v_producto_id uuid;
  v_servicio_id uuid;
  v_cantidad numeric;
  v_precio_unitario numeric;
  v_subtotal_item numeric;
  v_costo_actual numeric;
  v_stock_actual numeric;
begin
  insert into ventas (
    cliente_id, fecha, medio_pago, subtotal, iva_total, total, notas, created_by
  )
  values (
    nullif(payload->>'cliente_id', '')::uuid,
    (payload->>'fecha')::date,
    payload->>'medio_pago',
    (payload->>'subtotal')::numeric,
    (payload->>'iva_total')::numeric,
    (payload->>'total')::numeric,
    payload->>'notas',
    auth.uid()
  )
  returning id into v_venta_id;

  for v_item in select * from jsonb_array_elements(payload->'items')
  loop
    v_tipo := v_item->>'tipo';
    v_cantidad := (v_item->>'cantidad')::numeric;
    v_precio_unitario := (v_item->>'precio_unitario')::numeric;
    v_subtotal_item := v_cantidad * v_precio_unitario;

    if v_tipo = 'producto' then
      v_producto_id := (v_item->>'producto_id')::uuid;

      select stock_actual, costo_unitario_actual into v_stock_actual, v_costo_actual
      from productos where id = v_producto_id
      for update;

      if v_stock_actual is null then
        raise exception 'Producto % no encontrado', v_producto_id;
      end if;
      if v_stock_actual < v_cantidad then
        raise exception 'Stock insuficiente para el producto %', v_producto_id;
      end if;

      insert into items_venta (
        venta_id, tipo, producto_id, servicio_id, cantidad, precio_unitario,
        costo_unitario_snapshot, subtotal
      )
      values (
        v_venta_id, 'producto', v_producto_id, null, v_cantidad, v_precio_unitario,
        v_costo_actual, v_subtotal_item
      );

      insert into movimientos_stock (producto_id, tipo, cantidad, venta_id, usuario_id)
      values (v_producto_id, 'salida_venta', -v_cantidad, v_venta_id, auth.uid());

      update productos
      set stock_actual = stock_actual - v_cantidad
      where id = v_producto_id;
    else
      v_servicio_id := (v_item->>'servicio_id')::uuid;

      insert into items_venta (
        venta_id, tipo, producto_id, servicio_id, cantidad, precio_unitario,
        costo_unitario_snapshot, subtotal
      )
      values (
        v_venta_id, 'servicio', null, v_servicio_id, v_cantidad, v_precio_unitario,
        null, v_subtotal_item
      );
    end if;
  end loop;

  return v_venta_id;
end;
$$;

create or replace function anular_venta(p_venta_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_mov record;
begin
  update ventas set estado = 'anulada' where id = p_venta_id;

  for v_mov in
    select producto_id, cantidad from movimientos_stock
    where venta_id = p_venta_id and tipo = 'salida_venta'
  loop
    insert into movimientos_stock (producto_id, tipo, cantidad, venta_id, motivo, usuario_id)
    values (
      v_mov.producto_id, 'ajuste_manual', -v_mov.cantidad, p_venta_id,
      'Anulación de venta', auth.uid()
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
Expected: CLI reports `0017_registrar_venta.sql` applied.

- [ ] **Step 3: Implement the data layer**

`lib/data/ventas.ts`:
```typescript
import { createClient } from '@/lib/supabase/client'
import type { Venta, ItemVenta, MedioPago, TipoItemVenta } from '@/types/database'

export interface NuevaVentaItemInput {
  tipo: TipoItemVenta
  producto_id?: string | null
  servicio_id?: string | null
  cantidad: number
  precio_unitario: number
}

export interface NuevaVentaInput {
  cliente_id?: string | null
  fecha: string
  medio_pago: MedioPago
  subtotal: number
  iva_total: number
  total: number
  notas?: string | null
  items: NuevaVentaItemInput[]
}

export async function registrarVenta(input: NuevaVentaInput): Promise<{ id: string }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('registrar_venta', { payload: input } as never)
  if (error) throw error
  return { id: data as string }
}

export async function listarVentas(filtros?: {
  clienteId?: string
  medioPago?: MedioPago
  desde?: string
  hasta?: string
}): Promise<Venta[]> {
  const supabase = createClient()
  let query = supabase.from('ventas').select('*').order('fecha', { ascending: false })
  if (filtros?.clienteId) query = query.eq('cliente_id', filtros.clienteId)
  if (filtros?.medioPago) query = query.eq('medio_pago', filtros.medioPago)
  if (filtros?.desde) query = query.gte('fecha', filtros.desde)
  if (filtros?.hasta) query = query.lte('fecha', filtros.hasta)
  const { data, error } = await query
  if (error) throw error
  return data as Venta[]
}

export async function obtenerVentaConItems(
  id: string
): Promise<{ venta: Venta; items: ItemVenta[] }> {
  const supabase = createClient()
  const [{ data: venta, error: ventaError }, { data: items, error: itemsError }] =
    await Promise.all([
      supabase.from('ventas').select('*').eq('id', id).single(),
      supabase.from('items_venta').select('*').eq('venta_id', id),
    ])
  if (ventaError) throw ventaError
  if (itemsError) throw itemsError
  return { venta: venta as Venta, items: (items ?? []) as ItemVenta[] }
}

export async function anularVenta(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('anular_venta', { p_venta_id: id } as never)
  if (error) throw error
}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manually verify the stock-insufficient path**

In the Supabase SQL editor (or `psql`), run:
```sql
select registrar_venta('{
  "fecha": "2026-09-15",
  "medio_pago": "efectivo",
  "subtotal": 100000,
  "iva_total": 0,
  "total": 100000,
  "items": [{"tipo": "producto", "producto_id": "<id de un producto con poco stock>", "cantidad": 999999, "precio_unitario": 100}]
}'::jsonb);
```
Expected: raises `Stock insuficiente para el producto ...` and no row is left in `ventas` (transaction rolled back — confirm with `select count(*) from ventas;` before/after).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0017_registrar_venta.sql lib/data/ventas.ts
git commit -m "feat: add atomic sale registration and annulment RPCs"
```

---

### Task 4: Servicios — data layer and screens

**Files:**
- Create: `lib/data/servicios.ts`, `app/(app)/servicios/page.tsx`, `app/(app)/servicios/nuevo/page.tsx`, `app/(app)/servicios/ServicioForm.tsx`

**Interfaces:**
- Consumes: `Servicio`, `Rama` types (Task 1), `useEsAdministrador` (existing hook).
- Produces: `listarServicios(): Promise<Servicio[]>`, `crearServicio(input: Omit<Servicio, 'id' | 'created_at'>): Promise<Servicio>` — reused by Task 6 (service picker in the new-sale form) and Task 8 (frecuencia de lavado report needs a servicio id to filter by).

- [ ] **Step 1: Data layer**

`lib/data/servicios.ts`:
```typescript
import { createClient } from '@/lib/supabase/client'
import type { Servicio } from '@/types/database'

export async function listarServicios(): Promise<Servicio[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('servicios')
    .select('*')
    .eq('activo', true)
    .order('nombre')
  if (error) throw error
  return data as Servicio[]
}

export async function crearServicio(
  input: Omit<Servicio, 'id' | 'created_at'>
): Promise<Servicio> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('servicios')
    .insert(input as never)
    .select()
    .single()
  if (error) throw error
  return data as Servicio
}
```

- [ ] **Step 2: Shared form component**

`app/(app)/servicios/ServicioForm.tsx`:
```typescript
'use client'

import { useState } from 'react'
import type { Servicio, Rama } from '@/types/database'

export interface ServicioFormValues {
  nombre: string
  categoria: string
  rama: Rama | ''
  precio: number
}

export function ServicioForm({
  initial,
  onSubmit,
  submitLabel,
}: {
  initial?: Partial<Servicio>
  onSubmit: (values: ServicioFormValues) => Promise<void>
  submitLabel: string
}) {
  const [values, setValues] = useState<ServicioFormValues>({
    nombre: initial?.nombre ?? '',
    categoria: initial?.categoria ?? '',
    rama: initial?.rama ?? '',
    precio: initial?.precio ?? 0,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof ServicioFormValues>(key: K, value: ServicioFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!values.nombre.trim()) return setError('Ingresá un nombre.')
    if (values.precio < 0) return setError('El precio no puede ser negativo.')
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
        placeholder="Nombre (ej: Lavado, Consulta, Vacuna)"
        value={values.nombre}
        onChange={(e) => set('nombre', e.target.value)}
        className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
      />
      <input
        placeholder="Categoría (opcional)"
        value={values.categoria}
        onChange={(e) => set('categoria', e.target.value)}
        className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
      />
      <select
        value={values.rama}
        onChange={(e) => set('rama', e.target.value as Rama | '')}
        className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
      >
        <option value="">Sin rama</option>
        <option value="clinica">Clínica</option>
        <option value="petshop">Petshop</option>
      </select>
      <label className="text-sm text-ink-soft">
        Precio
        <input
          required
          type="number"
          min={0}
          step="any"
          value={values.precio}
          onChange={(e) => set('precio', Number(e.target.value))}
          className="mt-1 w-full rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        />
      </label>
      {error && <p className="text-sm text-negative">{error}</p>}
      <button type="submit" disabled={saving} className="pill-btn w-fit disabled:opacity-50">
        {saving ? 'Guardando…' : submitLabel}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: List screen**

`app/(app)/servicios/page.tsx`:
```typescript
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listarServicios } from '@/lib/data/servicios'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import type { Servicio } from '@/types/database'

export default function ServiciosPage() {
  const esAdmin = useEsAdministrador()
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listarServicios()
      .then(setServicios)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-5 sm:p-8">
      <div className="rise flex items-center justify-between">
        <h1 className="text-[27px] text-ink">Servicios</h1>
        {esAdmin === true && (
          <Link href="/servicios/nuevo" className="pill-btn">
            Nuevo servicio
          </Link>
        )}
      </div>
      {loading ? (
        <p className="text-sm text-ink-soft">Cargando…</p>
      ) : (
        <ul className="divide-y divide-line rounded-[var(--r-sm)] border border-line rise">
          {servicios.map((s) => (
            <li key={s.id} className="flex items-center justify-between p-3">
              <div>
                <span className="font-medium text-ink">{s.nombre}</span>
                {s.categoria && <span className="ml-2 text-sm text-ink-soft">{s.categoria}</span>}
              </div>
              <span className="mono text-sm text-ink">${s.precio.toLocaleString('es-AR')}</span>
            </li>
          ))}
          {servicios.length === 0 && (
            <li className="p-3 text-sm text-ink-soft">Sin servicios aún.</li>
          )}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create screen**

`app/(app)/servicios/nuevo/page.tsx`:
```typescript
'use client'

import { useRouter } from 'next/navigation'
import { crearServicio } from '@/lib/data/servicios'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import { ServicioForm } from '../ServicioForm'

export default function NuevoServicioPage() {
  const esAdmin = useEsAdministrador()
  const router = useRouter()

  if (esAdmin === null) return <p className="p-8 text-sm text-ink-soft">Cargando…</p>
  if (esAdmin === false) {
    return (
      <p className="p-8 text-sm text-negative">
        Acceso restringido — contactá a un administrador.
      </p>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-5 sm:p-8">
      <h1 className="rise text-[27px] text-ink">Nuevo servicio</h1>
      <ServicioForm
        submitLabel="Crear servicio"
        onSubmit={async (values) => {
          await crearServicio({
            nombre: values.nombre.trim(),
            categoria: values.categoria.trim() || null,
            rama: values.rama || null,
            precio: values.precio,
            activo: true,
          })
          router.push('/servicios')
        }}
      />
    </div>
  )
}
```

- [ ] **Step 5: Manually verify**

Run `npm run dev`, log in as admin, go to `/servicios`, create "Lavado" (rama `petshop`, precio 5000), confirm it appears in the list.

- [ ] **Step 6: Commit**

```bash
git add lib/data/servicios.ts "app/(app)/servicios"
git commit -m "feat: add servicios catalog screens"
```

---

### Task 5: Clientes — data layer

**Files:**
- Create: `lib/data/clientes.ts`

**Interfaces:**
- Consumes: `Cliente` type (Task 1).
- Produces: `listarClientes(): Promise<Cliente[]>`, `crearCliente(input: Omit<Cliente, 'id' | 'created_at'>): Promise<Cliente>` — consumed inline by Task 6 (customer picker + quick-add in the new-sale form). No dedicated `/clientes` screen this phase — quick-add from the sale form covers the "cliente opcional" requirement without a separate CRUD surface.

- [ ] **Step 1: Implement**

`lib/data/clientes.ts`:
```typescript
import { createClient } from '@/lib/supabase/client'
import type { Cliente } from '@/types/database'

export async function listarClientes(): Promise<Cliente[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('clientes').select('*').order('nombre')
  if (error) throw error
  return data as Cliente[]
}

export async function crearCliente(
  input: Omit<Cliente, 'id' | 'created_at'>
): Promise<Cliente> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('clientes')
    .insert(input as never)
    .select()
    .single()
  if (error) throw error
  return data as Cliente
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/data/clientes.ts
git commit -m "feat: add clientes data layer"
```

---

### Task 6: New sale screen

**Files:**
- Create: `app/(app)/ventas/nueva/page.tsx`

**Interfaces:**
- Consumes: `listarProductos` (existing), `listarServicios` (Task 4), `listarClientes`, `crearCliente` (Task 5), `calcularSubtotalItemVenta`, `calcularTotalesVenta` (Task 2), `registrarVenta` (Task 3).
- Produces: working "Nueva Venta" flow — the central deliverable of this phase.

- [ ] **Step 1: Build the form**

`app/(app)/ventas/nueva/page.tsx`:
```typescript
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { listarProductos } from '@/lib/data/productos'
import { listarServicios } from '@/lib/data/servicios'
import { listarClientes, crearCliente } from '@/lib/data/clientes'
import { registrarVenta, type NuevaVentaItemInput } from '@/lib/data/ventas'
import { calcularTotalesVenta } from '@/lib/calc/venta'
import type { Producto, Servicio, Cliente, MedioPago, TipoItemVenta } from '@/types/database'

const MEDIOS_PAGO: { value: MedioPago; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia / Mercado Pago' },
]

interface ItemCarrito {
  key: string
  tipo: TipoItemVenta
  productoId?: string
  servicioId?: string
  nombre: string
  cantidad: number
  precioUnitario: number
}

export default function NuevaVentaPage() {
  const router = useRouter()
  const [productos, setProductos] = useState<Producto[]>([])
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [items, setItems] = useState<ItemCarrito[]>([])
  const [clienteId, setClienteId] = useState('')
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState('')
  const [medioPago, setMedioPago] = useState<MedioPago>('efectivo')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listarProductos().then(setProductos)
    listarServicios().then(setServicios)
    listarClientes().then(setClientes)
  }, [])

  const resultadosProducto = busqueda
    ? productos.filter((p) => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : []
  const resultadosServicio = busqueda
    ? servicios.filter((s) => s.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : []

  function agregarProducto(p: Producto) {
    setItems((prev) => [
      ...prev,
      {
        key: `producto-${p.id}-${prev.length}`,
        tipo: 'producto',
        productoId: p.id,
        nombre: p.nombre,
        cantidad: 1,
        precioUnitario: p.precio_venta,
      },
    ])
    setBusqueda('')
  }

  function agregarServicio(s: Servicio) {
    setItems((prev) => [
      ...prev,
      {
        key: `servicio-${s.id}-${prev.length}`,
        tipo: 'servicio',
        servicioId: s.id,
        nombre: s.nombre,
        cantidad: 1,
        precioUnitario: s.precio,
      },
    ])
    setBusqueda('')
  }

  function actualizarItem(key: string, cambios: Partial<ItemCarrito>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...cambios } : i)))
  }

  function quitarItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key))
  }

  const totales = calcularTotalesVenta(items.map((i) => ({ cantidad: i.cantidad, precioUnitario: i.precioUnitario })))

  async function handleAgregarCliente() {
    if (!nuevoClienteNombre.trim()) return
    const cliente = await crearCliente({
      nombre: nuevoClienteNombre.trim(),
      telefono: null,
      email: null,
    })
    setClientes((prev) => [...prev, cliente].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    setClienteId(cliente.id)
    setNuevoClienteNombre('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (items.length === 0) return setError('Agregá al menos un producto o servicio.')
    if (items.some((i) => i.cantidad <= 0)) return setError('Todas las cantidades deben ser mayores a 0.')

    setSaving(true)
    try {
      const itemsInput: NuevaVentaItemInput[] = items.map((i) => ({
        tipo: i.tipo,
        producto_id: i.tipo === 'producto' ? i.productoId : null,
        servicio_id: i.tipo === 'servicio' ? i.servicioId : null,
        cantidad: i.cantidad,
        precio_unitario: i.precioUnitario,
      }))
      const { id } = await registrarVenta({
        cliente_id: clienteId || null,
        fecha: new Date().toISOString().slice(0, 10),
        medio_pago: medioPago,
        subtotal: totales.subtotal,
        iva_total: totales.ivaTotal,
        total: totales.total,
        notas: notas.trim() || null,
        items: itemsInput,
      })
      router.push(`/ventas/${id}`)
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : ''
      if (mensaje.includes('Stock insuficiente')) {
        setError('No hay stock suficiente para uno de los productos. Revisá las cantidades.')
      } else {
        setError('No se pudo registrar la venta. Intentá de nuevo.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-5 sm:p-8">
      <h1 className="rise text-[27px] text-ink">Nueva venta</h1>

      <div className="rise flex flex-col gap-2">
        <input
          placeholder="Buscar producto o servicio…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        />
        {(resultadosProducto.length > 0 || resultadosServicio.length > 0) && (
          <ul className="max-h-56 overflow-y-auto rounded-[var(--r-sm)] border border-line">
            {resultadosProducto.map((p) => (
              <li
                key={p.id}
                onClick={() => agregarProducto(p)}
                className="flex cursor-pointer justify-between p-2 text-sm text-ink hover:bg-surface"
              >
                <span>{p.nombre} <span className="text-ink-faint">(producto)</span></span>
                <span className="mono">${p.precio_venta.toLocaleString('es-AR')}</span>
              </li>
            ))}
            {resultadosServicio.map((s) => (
              <li
                key={s.id}
                onClick={() => agregarServicio(s)}
                className="flex cursor-pointer justify-between p-2 text-sm text-ink hover:bg-surface"
              >
                <span>{s.nombre} <span className="text-ink-faint">(servicio)</span></span>
                <span className="mono">${s.precio.toLocaleString('es-AR')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ul className="rise flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-2 rounded-[var(--r-sm)] border border-line p-2.5">
            <span className="flex-1 text-sm text-ink">{item.nombre}</span>
            <input
              type="number"
              min={0.0001}
              step="any"
              value={item.cantidad}
              onChange={(e) => actualizarItem(item.key, { cantidad: Number(e.target.value) })}
              className="w-16 rounded-[var(--r-sm)] border border-line bg-surface p-1.5 text-sm text-ink"
            />
            <input
              type="number"
              min={0}
              step="any"
              value={item.precioUnitario}
              onChange={(e) => actualizarItem(item.key, { precioUnitario: Number(e.target.value) })}
              className="w-24 rounded-[var(--r-sm)] border border-line bg-surface p-1.5 text-sm text-ink"
            />
            <button
              type="button"
              onClick={() => quitarItem(item.key)}
              className="text-sm text-negative"
            >
              Quitar
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-ink-soft">Sin ítems todavía.</li>}
      </ul>

      <form onSubmit={handleSubmit} className="rise flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <select
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
          >
            <option value="">Sin cliente</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <select
            value={medioPago}
            onChange={(e) => setMedioPago(e.target.value as MedioPago)}
            className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
          >
            {MEDIOS_PAGO.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <input
            placeholder="Alta rápida de cliente"
            value={nuevoClienteNombre}
            onChange={(e) => setNuevoClienteNombre(e.target.value)}
            className="flex-1 rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
          />
          <button type="button" onClick={handleAgregarCliente} className="pill-btn">
            Agregar cliente
          </button>
        </div>
        <textarea
          placeholder="Notas (opcional)"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        />
        <p className="mono text-lg text-ink">Total: ${totales.total.toLocaleString('es-AR')}</p>
        {error && <p className="text-sm text-negative">{error}</p>}
        <button type="submit" disabled={saving} className="pill-btn w-fit disabled:opacity-50">
          {saving ? 'Guardando…' : 'Registrar venta'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Manually verify**

Run `npm run dev`, go to `/ventas/nueva`, search and add a product and the "Lavado" service created in Task 4, adjust quantities, add a quick-add customer, submit. Confirm redirect to `/ventas/[id]` (Task 7 builds that page next — until then this will 404, which is expected at this point in the plan) and that `productos.stock_actual` decreased by the sold quantity (check via `/productos`).

Then repeat with a quantity larger than the product's `stock_actual` and confirm the error message renders and no venta was created.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/ventas/nueva"
git commit -m "feat: add new sale screen with stock-aware validation"
```

---

### Task 7: Sale list and detail screens

**Files:**
- Create: `app/(app)/ventas/page.tsx`, `app/(app)/ventas/[id]/page.tsx`

**Interfaces:**
- Consumes: `listarVentas`, `obtenerVentaConItems`, `anularVenta` (Task 3), `listarClientes` (Task 5), `useEsAdministrador` (existing hook).
- Produces: `/ventas` (list) and `/ventas/[id]` (detail + anular) — completes the sale-management flow.

- [ ] **Step 1: List screen**

`app/(app)/ventas/page.tsx`:
```typescript
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listarVentas } from '@/lib/data/ventas'
import type { Venta } from '@/types/database'

export default function VentasPage() {
  const [ventas, setVentas] = useState<Venta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listarVentas()
      .then(setVentas)
      .finally(() => setLoading(false))
  }, [])

  const totalPeriodo = ventas
    .filter((v) => v.estado !== 'anulada')
    .reduce((acc, v) => acc + v.total, 0)

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-5 sm:p-8">
      <div className="rise flex items-center justify-between">
        <h1 className="text-[27px] text-ink">Ventas</h1>
        <Link href="/ventas/nueva" className="pill-btn">
          Nueva venta
        </Link>
      </div>
      {loading ? (
        <p className="text-sm text-ink-soft">Cargando…</p>
      ) : (
        <>
          <p className="rise mono text-sm text-ink-soft">
            Total: ${totalPeriodo.toLocaleString('es-AR')}
          </p>
          <ul className="divide-y divide-line rounded-[var(--r-sm)] border border-line rise">
            {ventas.map((v) => (
              <li key={v.id} className="p-3 hover:bg-surface">
                <Link href={`/ventas/${v.id}`} className="flex items-center justify-between">
                  <span className="text-sm text-ink">
                    {v.fecha} — {v.medio_pago}
                    {v.estado === 'anulada' && <span className="chip down ml-2">ANULADA</span>}
                  </span>
                  <span className="mono text-sm text-ink">${v.total.toLocaleString('es-AR')}</span>
                </Link>
              </li>
            ))}
            {ventas.length === 0 && <li className="p-3 text-sm text-ink-soft">Sin ventas aún.</li>}
          </ul>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Detail screen with anular**

`app/(app)/ventas/[id]/page.tsx`:
```typescript
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { obtenerVentaConItems, anularVenta } from '@/lib/data/ventas'
import { listarClientes } from '@/lib/data/clientes'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import type { Venta, ItemVenta, Cliente } from '@/types/database'

export default function DetalleVentaPage() {
  const { id } = useParams<{ id: string }>()
  const esAdmin = useEsAdministrador()
  const [venta, setVenta] = useState<Venta | null>(null)
  const [items, setItems] = useState<ItemVenta[]>([])
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [anulando, setAnulando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    obtenerVentaConItems(id).then(({ venta, items }) => {
      setVenta(venta)
      setItems(items)
      if (venta.cliente_id) {
        listarClientes().then((clientes) => {
          setCliente(clientes.find((c) => c.id === venta.cliente_id) ?? null)
        })
      }
    })
  }, [id])

  if (!venta) return <p className="p-8 text-sm text-ink-soft">Cargando…</p>

  async function handleAnular() {
    if (!confirm('¿Anular esta venta? Se repondrá el stock de los productos vendidos.')) return
    setError(null)
    setAnulando(true)
    try {
      await anularVenta(id)
      const { venta: actualizada } = await obtenerVentaConItems(id)
      setVenta(actualizada)
    } catch {
      setError('No se pudo anular la venta. Intentá de nuevo.')
    } finally {
      setAnulando(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-5 sm:p-8">
      <div className="rise">
        <h1 className="flex items-center gap-2 text-[27px] text-ink">
          Venta {venta.fecha}
          {venta.estado === 'anulada' && <span className="chip down">ANULADA</span>}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {cliente?.nombre ?? 'Sin cliente'} — {venta.medio_pago}
        </p>
      </div>
      <ul className="rise divide-y divide-line rounded-[var(--r-sm)] border border-line">
        {items.map((item) => (
          <li key={item.id} className="flex justify-between p-3 text-sm text-ink">
            <span>
              {item.cantidad} × ${item.precio_unitario.toLocaleString('es-AR')}
              {item.tipo === 'servicio' && <span className="ml-2 text-ink-faint">(servicio)</span>}
            </span>
            <span className="mono">${item.subtotal.toLocaleString('es-AR')}</span>
          </li>
        ))}
      </ul>
      <p className="rise mono text-lg text-ink">Total: ${venta.total.toLocaleString('es-AR')}</p>
      {error && <p className="text-sm text-negative">{error}</p>}
      {esAdmin === true && venta.estado !== 'anulada' && (
        <button
          type="button"
          onClick={handleAnular}
          disabled={anulando}
          className="pill-btn w-fit disabled:opacity-50"
        >
          {anulando ? 'Anulando…' : 'Anular venta'}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Manually verify**

Run `npm run dev`, go to `/ventas`, confirm the sale from Task 6 appears with the right total. Open its detail, confirm items render correctly (producto item shows no "(servicio)" tag, the Lavado item does). As an admin, click "Anular venta", confirm the tag flips to `ANULADA` and the sold product's `stock_actual` (check `/productos`) is restored.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/ventas/page.tsx" "app/(app)/ventas/[id]"
git commit -m "feat: add sale list and detail screens with annulment"
```

---

### Task 8: Income and profitability reports (TDD)

**Files:**
- Modify: `lib/data/reportes.ts`, `lib/data/reportes.test.ts`

**Interfaces:**
- Consumes: `Venta`, `ItemVenta`, `Servicio`, `Gasto`, `Producto`, `Rama` types; reuses the private helpers `inicioSemana` (already exported), `claveMes`, `parseFechaLocal` already defined in `reportes.ts` (Fase 1) — no new imports needed since these functions live in the same file.
- Produces:
  - `calcularIngresoPorSemana(ventas: Venta[], semanas: number, hoy?: Date): { semana: string; total: number }[]`
  - `calcularIngresoPorMes(ventas: Venta[], meses: number, hoy?: Date): { mes: string; total: number }[]`
  - `calcularVentasPorMedioPago(ventas: Venta[]): { medioPago: MedioPago; total: number }[]`
  - `calcularRentabilidadPorRama(ventas: Venta[], itemsVenta: ItemVenta[], productos: Producto[], servicios: Servicio[], gastos: Gasto[]): Record<Rama, { ingreso: number; costoMercaderia: number; gasto: number; neto: number }>`
  - `calcularFrecuenciaServicioPorSemana(ventas: Venta[], itemsVenta: ItemVenta[], servicioId: string, semanas: number, hoy?: Date): { semana: string; vecesVendido: number; cantidadTotal: number }[]`
  - `calcularFrecuenciaServicioPorMes(ventas: Venta[], itemsVenta: ItemVenta[], servicioId: string, meses: number, hoy?: Date): { mes: string; vecesVendido: number; cantidadTotal: number }[]`
- Consumed by: Task 9 (dashboard ingreso/neto cards, reportes page lavado chart).

- [ ] **Step 1: Write the failing tests**

Extend the existing import block at the top of `lib/data/reportes.test.ts`:
```typescript
import {
  calcularGastoPorProveedor,
  calcularValorStock,
  calcularGastoPorSemana,
  inicioSemana,
  calcularGastoPorMes,
  calcularGastoPorDiaSemana,
  calcularCapitalEnRiesgoPorRama,
  calcularGastoPorProveedorPorRama,
  calcularComprobantesPorRama,
  anosConFacturas,
  calcularGastoPorTrimestre,
  calcularSemanaGanadoraPorMes,
  calcularProductosMasComprados,
  calcularIngresoPorSemana,
  calcularIngresoPorMes,
  calcularVentasPorMedioPago,
  calcularRentabilidadPorRama,
  calcularFrecuenciaServicioPorSemana,
  calcularFrecuenciaServicioPorMes,
} from './reportes'
import type {
  FacturaCompra,
  Proveedor,
  Producto,
  ItemFactura,
  Rama,
  Venta,
  ItemVenta,
  Servicio,
  Gasto,
} from '@/types/database'
```

Append to the end of `lib/data/reportes.test.ts`:
```typescript
function venta(id: string, fecha: string, total: number, opts?: Partial<Venta>): Venta {
  return {
    id,
    cliente_id: null,
    fecha,
    medio_pago: 'efectivo',
    subtotal: total,
    iva_total: 0,
    total,
    estado: 'confirmada',
    notas: null,
    created_at: fecha,
    created_by: null,
    ...opts,
  }
}

function itemVentaProducto(
  ventaId: string,
  productoId: string,
  cantidad: number,
  precioUnitario: number,
  costoUnitarioSnapshot: number
): ItemVenta {
  return {
    id: `${ventaId}-${productoId}`,
    venta_id: ventaId,
    tipo: 'producto',
    producto_id: productoId,
    servicio_id: null,
    cantidad,
    precio_unitario: precioUnitario,
    costo_unitario_snapshot: costoUnitarioSnapshot,
    subtotal: cantidad * precioUnitario,
  }
}

function itemVentaServicio(
  ventaId: string,
  servicioId: string,
  cantidad: number,
  precioUnitario: number
): ItemVenta {
  return {
    id: `${ventaId}-${servicioId}`,
    venta_id: ventaId,
    tipo: 'servicio',
    producto_id: null,
    servicio_id: servicioId,
    cantidad,
    precio_unitario: precioUnitario,
    costo_unitario_snapshot: null,
    subtotal: cantidad * precioUnitario,
  }
}

function producto(id: string, rama: Rama): Producto {
  return {
    id,
    nombre: id,
    categoria: null,
    rama,
    unidad_compra: 'unidad',
    unidad_stock: 'unidad',
    factor_conversion: 1,
    stock_actual: 0,
    stock_minimo: 0,
    costo_unitario_actual: 0,
    precio_venta: 0,
    alicuota_iva: 21,
    activo: true,
    codigo: null,
    codigo_barras: null,
    created_at: '',
  }
}

function servicio(id: string, rama: Rama): Servicio {
  return { id, nombre: id, categoria: null, rama, precio: 0, activo: true, created_at: '' }
}

function gasto(rama: Rama, monto: number): Gasto {
  return {
    id: `${rama}-${monto}`,
    fecha: '2026-01-01',
    categoria: 'otro',
    concepto: 'test',
    proveedor: null,
    monto,
    rama,
    notas: null,
    created_at: '',
    created_by: null,
  }
}

describe('calcularIngresoPorSemana', () => {
  it('groups sale totals into the current week bucket, excluding anuladas', () => {
    const hoy = new Date(2026, 8, 15) // martes 15/09/2026
    const ventas = [
      venta('v1', '2026-09-15', 1000),
      venta('v2', '2026-09-14', 500),
      venta('v3', '2026-09-14', 999999, { estado: 'anulada' }),
    ]
    const resultado = calcularIngresoPorSemana(ventas, 1, hoy)
    expect(resultado).toHaveLength(1)
    expect(resultado[0].total).toBe(1500)
  })
})

describe('calcularIngresoPorMes', () => {
  it('groups sale totals by month', () => {
    const hoy = new Date(2026, 8, 15)
    const ventas = [venta('v1', '2026-09-01', 2000), venta('v2', '2026-08-15', 3000)]
    const resultado = calcularIngresoPorMes(ventas, 2, hoy)
    expect(resultado).toEqual([
      { mes: '2026-08', total: 3000 },
      { mes: '2026-09', total: 2000 },
    ])
  })
})

describe('calcularVentasPorMedioPago', () => {
  it('sums totals per payment method, excluding anuladas', () => {
    const ventas = [
      venta('v1', '2026-09-01', 1000, { medio_pago: 'efectivo' }),
      venta('v2', '2026-09-02', 2000, { medio_pago: 'tarjeta' }),
      venta('v3', '2026-09-03', 500, { medio_pago: 'efectivo' }),
      venta('v4', '2026-09-04', 999, { medio_pago: 'efectivo', estado: 'anulada' }),
    ]
    const resultado = calcularVentasPorMedioPago(ventas)
    expect(resultado).toContainEqual({ medioPago: 'efectivo', total: 1500 })
    expect(resultado).toContainEqual({ medioPago: 'tarjeta', total: 2000 })
  })
})

describe('calcularRentabilidadPorRama', () => {
  it('nets income minus cost of goods sold minus gasto, per rama', () => {
    const ventas = [venta('v1', '2026-09-01', 6000)]
    const items = [
      itemVentaProducto('v1', 'p1', 3, 1000, 600), // petshop: ingreso 3000, costo 1800
      itemVentaServicio('v1', 's1', 1, 3000), // clinica: ingreso 3000, sin costo
    ]
    const productos = [producto('p1', 'petshop')]
    const servicios = [servicio('s1', 'clinica')]
    const gastos = [gasto('petshop', 500), gasto('clinica', 200)]

    const resultado = calcularRentabilidadPorRama(ventas, items, productos, servicios, gastos)

    expect(resultado.petshop).toEqual({ ingreso: 3000, costoMercaderia: 1800, gasto: 500, neto: 700 })
    expect(resultado.clinica).toEqual({ ingreso: 3000, costoMercaderia: 0, gasto: 200, neto: 2800 })
  })

  it('ignores items belonging to an anulada venta', () => {
    const ventas = [venta('v1', '2026-09-01', 3000, { estado: 'anulada' })]
    const items = [itemVentaProducto('v1', 'p1', 3, 1000, 600)]
    const productos = [producto('p1', 'petshop')]
    const resultado = calcularRentabilidadPorRama(ventas, items, productos, [], [])
    expect(resultado.petshop.ingreso).toBe(0)
  })
})

describe('calcularFrecuenciaServicioPorSemana', () => {
  it('counts occurrences and total units of a service per week', () => {
    const hoy = new Date(2026, 8, 15) // semana del 14/09/2026
    const ventas = [venta('v1', '2026-09-15', 5000), venta('v2', '2026-09-14', 5000)]
    const items = [
      itemVentaServicio('v1', 'lavado', 1, 5000),
      itemVentaServicio('v2', 'lavado', 2, 2500),
    ]
    const resultado = calcularFrecuenciaServicioPorSemana(ventas, items, 'lavado', 1, hoy)
    expect(resultado).toHaveLength(1)
    expect(resultado[0].vecesVendido).toBe(2)
    expect(resultado[0].cantidadTotal).toBe(3)
  })
})

describe('calcularFrecuenciaServicioPorMes', () => {
  it('counts a service across separate months, excluding anuladas', () => {
    const hoy = new Date(2026, 8, 15)
    const ventas = [
      venta('v1', '2026-09-05', 5000),
      venta('v2', '2026-08-10', 5000),
      venta('v3', '2026-08-20', 5000, { estado: 'anulada' }),
    ]
    const items = [
      itemVentaServicio('v1', 'lavado', 1, 5000),
      itemVentaServicio('v2', 'lavado', 1, 5000),
      itemVentaServicio('v3', 'lavado', 1, 5000),
    ]
    const resultado = calcularFrecuenciaServicioPorMes(ventas, items, 'lavado', 2, hoy)
    expect(resultado).toEqual([
      { mes: '2026-08', vecesVendido: 1, cantidadTotal: 1 },
      { mes: '2026-09', vecesVendido: 1, cantidadTotal: 1 },
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — the new functions don't exist yet in `./reportes`.

- [ ] **Step 3: Implement**

Change the top `import type` line in `lib/data/reportes.ts` to include the new types:
```typescript
import type {
  FacturaCompra,
  Proveedor,
  Producto,
  ItemFactura,
  Rama,
  TipoComprobante,
  Venta,
  ItemVenta,
  Servicio,
  Gasto,
  MedioPago,
} from '@/types/database'
```

Then append these functions at the end of the file:
```typescript
export function calcularIngresoPorSemana(
  ventas: Venta[],
  semanas: number,
  hoy: Date = new Date()
): { semana: string; total: number }[] {
  const etiquetas: string[] = []
  const totales = new Map<string, number>()
  for (let i = semanas - 1; i >= 0; i--) {
    const d = new Date(hoy)
    d.setDate(d.getDate() - i * 7)
    const clave = inicioSemana(d)
    etiquetas.push(clave)
    totales.set(clave, 0)
  }
  for (const v of ventas) {
    if (v.estado === 'anulada') continue
    const clave = inicioSemana(parseFechaLocal(v.fecha))
    if (totales.has(clave)) totales.set(clave, (totales.get(clave) ?? 0) + v.total)
  }
  return etiquetas.map((clave) => ({ semana: clave, total: totales.get(clave) ?? 0 }))
}

export function calcularIngresoPorMes(
  ventas: Venta[],
  meses: number,
  hoy: Date = new Date()
): { mes: string; total: number }[] {
  const etiquetas: string[] = []
  const totales = new Map<string, number>()
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    const clave = claveMes(d)
    etiquetas.push(clave)
    totales.set(clave, 0)
  }
  for (const v of ventas) {
    if (v.estado === 'anulada') continue
    const clave = claveMes(parseFechaLocal(v.fecha))
    if (totales.has(clave)) totales.set(clave, (totales.get(clave) ?? 0) + v.total)
  }
  return etiquetas.map((clave) => ({ mes: clave, total: totales.get(clave) ?? 0 }))
}

export function calcularVentasPorMedioPago(
  ventas: Venta[]
): { medioPago: MedioPago; total: number }[] {
  const totales = new Map<MedioPago, number>()
  for (const v of ventas) {
    if (v.estado === 'anulada') continue
    totales.set(v.medio_pago, (totales.get(v.medio_pago) ?? 0) + v.total)
  }
  return Array.from(totales.entries()).map(([medioPago, total]) => ({ medioPago, total }))
}

export function calcularRentabilidadPorRama(
  ventas: Venta[],
  itemsVenta: ItemVenta[],
  productos: Producto[],
  servicios: Servicio[],
  gastos: Gasto[]
): Record<Rama, { ingreso: number; costoMercaderia: number; gasto: number; neto: number }> {
  const resultado: Record<Rama, { ingreso: number; costoMercaderia: number; gasto: number; neto: number }> = {
    clinica: { ingreso: 0, costoMercaderia: 0, gasto: 0, neto: 0 },
    petshop: { ingreso: 0, costoMercaderia: 0, gasto: 0, neto: 0 },
  }
  const ventasValidasIds = new Set(
    ventas.filter((v) => v.estado !== 'anulada').map((v) => v.id)
  )
  const productoRama = new Map(productos.map((p) => [p.id, p.rama]))
  const servicioRama = new Map(servicios.map((s) => [s.id, s.rama]))

  for (const item of itemsVenta) {
    if (!ventasValidasIds.has(item.venta_id)) continue
    const rama =
      item.tipo === 'producto'
        ? productoRama.get(item.producto_id ?? '')
        : servicioRama.get(item.servicio_id ?? '')
    if (rama !== 'clinica' && rama !== 'petshop') continue
    resultado[rama].ingreso += item.subtotal
    if (item.tipo === 'producto') {
      resultado[rama].costoMercaderia += item.cantidad * (item.costo_unitario_snapshot ?? 0)
    }
  }

  for (const g of gastos) {
    if (g.rama !== 'clinica' && g.rama !== 'petshop') continue
    resultado[g.rama].gasto += g.monto
  }

  for (const rama of RAMAS) {
    resultado[rama].neto = resultado[rama].ingreso - resultado[rama].costoMercaderia - resultado[rama].gasto
  }

  return resultado
}

export function calcularFrecuenciaServicioPorSemana(
  ventas: Venta[],
  itemsVenta: ItemVenta[],
  servicioId: string,
  semanas: number,
  hoy: Date = new Date()
): { semana: string; vecesVendido: number; cantidadTotal: number }[] {
  const etiquetas: string[] = []
  const conteos = new Map<string, { vecesVendido: number; cantidadTotal: number }>()
  for (let i = semanas - 1; i >= 0; i--) {
    const d = new Date(hoy)
    d.setDate(d.getDate() - i * 7)
    const clave = inicioSemana(d)
    etiquetas.push(clave)
    conteos.set(clave, { vecesVendido: 0, cantidadTotal: 0 })
  }
  const ventaPorId = new Map(ventas.map((v) => [v.id, v]))
  for (const item of itemsVenta) {
    if (item.tipo !== 'servicio' || item.servicio_id !== servicioId) continue
    const venta = ventaPorId.get(item.venta_id)
    if (!venta || venta.estado === 'anulada') continue
    const clave = inicioSemana(parseFechaLocal(venta.fecha))
    const actual = conteos.get(clave)
    if (actual) {
      actual.vecesVendido += 1
      actual.cantidadTotal += item.cantidad
    }
  }
  return etiquetas.map((clave) => ({
    semana: clave,
    ...(conteos.get(clave) ?? { vecesVendido: 0, cantidadTotal: 0 }),
  }))
}

export function calcularFrecuenciaServicioPorMes(
  ventas: Venta[],
  itemsVenta: ItemVenta[],
  servicioId: string,
  meses: number,
  hoy: Date = new Date()
): { mes: string; vecesVendido: number; cantidadTotal: number }[] {
  const etiquetas: string[] = []
  const conteos = new Map<string, { vecesVendido: number; cantidadTotal: number }>()
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    const clave = claveMes(d)
    etiquetas.push(clave)
    conteos.set(clave, { vecesVendido: 0, cantidadTotal: 0 })
  }
  const ventaPorId = new Map(ventas.map((v) => [v.id, v]))
  for (const item of itemsVenta) {
    if (item.tipo !== 'servicio' || item.servicio_id !== servicioId) continue
    const venta = ventaPorId.get(item.venta_id)
    if (!venta || venta.estado === 'anulada') continue
    const clave = claveMes(parseFechaLocal(venta.fecha))
    const actual = conteos.get(clave)
    if (actual) {
      actual.vecesVendido += 1
      actual.cantidadTotal += item.cantidad
    }
  }
  return etiquetas.map((clave) => ({
    mes: clave,
    ...(conteos.get(clave) ?? { vecesVendido: 0, cantidadTotal: 0 }),
  }))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all existing `reportes.test.ts` tests plus the new ones.

- [ ] **Step 5: Commit**

```bash
git add lib/data/reportes.ts lib/data/reportes.test.ts
git commit -m "feat: add income, profitability, and service-frequency reports"
```

---

### Task 9: Dashboard, reportes page, and navigation

**Files:**
- Modify: `app/(app)/page.tsx`, `app/(app)/reportes/page.tsx`, `components/Sidebar.tsx`

**Interfaces:**
- Consumes: `listarVentas`, `obtenerVentaConItems` (Task 3), `calcularIngresoPorSemana`, `calcularFrecuenciaServicioPorSemana` (Task 8), `listarServicios` (Task 4).
- Produces: dashboard cards for ingreso semanal and neto (ingreso − egreso); a frecuencia-de-lavado bar chart on `/reportes`; `Ventas` and `Servicios` sidebar entries.

- [ ] **Step 1: Add data fetching and ingreso/neto cards to the dashboard**

In `app/(app)/page.tsx`, extend the imports:
```typescript
import { listarVentas } from '@/lib/data/ventas'
import {
  calcularValorStock,
  calcularGastoPorSemana,
  calcularGastoPorMes,
  calcularCapitalEnRiesgoPorRama,
  calcularGastoPorProveedorPorRama,
  calcularComprobantesPorRama,
  calcularIngresoPorSemana,
  RAMAS,
} from '@/lib/data/reportes'
import type {
  FacturaCompra,
  Proveedor,
  Producto,
  Perfil,
  ItemFactura,
  MovimientoStock,
  Rama,
  Venta,
} from '@/types/database'
```

Add a `ventas` state alongside the existing `facturas`/`productos` state (find the `useState<FacturaCompra[]>` declaration and the `useEffect` that populates it — add a parallel one):
```typescript
const [ventas, setVentas] = useState<Venta[]>([])
```
and in the data-loading `useEffect`, alongside the existing `listarFacturas().then(setFacturas)` call:
```typescript
listarVentas().then(setVentas)
```

Add, near the existing weekly gasto stat card (find where `calcularGastoPorSemana(facturas, ...)` is rendered as a `StatShell`), the ingreso/neto computation:
```typescript
const ingresoSemanal = calcularIngresoPorSemana(ventas, 1)[0]?.total ?? 0
const gastoSemanal = calcularGastoPorSemana(facturas, 1)[0]?.total ?? 0
const netoSemanal = ingresoSemanal - gastoSemanal
```
and render two more `<StatShell>` blocks next to the existing gasto ones:
```tsx
<StatShell eyebrow="Ingreso semanal" value={`$${ingresoSemanal.toLocaleString('es-AR')}`} />
<StatShell
  eyebrow="Neto semanal"
  value={`$${netoSemanal.toLocaleString('es-AR')}`}
  delta={{ texto: netoSemanal >= 0 ? 'positivo' : 'negativo', positivo: netoSemanal >= 0 }}
/>
```

- [ ] **Step 2: Manually verify the dashboard**

Run `npm run dev`, go to `/`, confirm "Ingreso semanal" and "Neto semanal" cards render with the totals from the ventas registered in Task 6/7's manual tests.

- [ ] **Step 3: Add the frecuencia-de-lavado chart to `/reportes`**

In `app/(app)/reportes/page.tsx`, extend imports:
```typescript
import { listarVentas, obtenerVentaConItems } from '@/lib/data/ventas'
import { listarServicios } from '@/lib/data/servicios'
import { calcularFrecuenciaServicioPorSemana } from '@/lib/data/reportes'
import type { Venta, Servicio, ItemVenta } from '@/types/database'
```

Add state and fetch (alongside the existing `facturas` state/effect):
```typescript
const [ventas, setVentas] = useState<Venta[]>([])
const [servicios, setServicios] = useState<Servicio[]>([])
const [itemsVenta, setItemsVenta] = useState<ItemVenta[]>([])
```
```typescript
listarVentas().then(setVentas)
listarServicios().then(setServicios)
```
and, once `ventas` is populated, fetch all their items in one effect:
```typescript
useEffect(() => {
  if (ventas.length === 0) return
  Promise.all(ventas.map((v) => obtenerVentaConItems(v.id))).then((resultados) => {
    setItemsVenta(resultados.flatMap((r) => r.items))
  })
}, [ventas])
```

Compute the weekly frequency for the "Lavado" servicio:
```typescript
const lavado = servicios.find((s) => s.nombre.toLowerCase() === 'lavado')
const datosLavadoPorSemana = lavado
  ? calcularFrecuenciaServicioPorSemana(ventas, itemsVenta, lavado.id, 12)
  : []
```

Render it using the same bar-chart markup pattern already used for the existing `calcularGastoPorSemana` chart (see the block around line 57 that computes `maximo = Math.max(...datos.map((d) => d.total), 1)` and renders one `<div>` bar per week with `style={{ height: `${Math.max(4, (d.total / maximo) * 100)}%` }}`). Mirror it for lavados, keyed on `cantidadTotal` instead of `total`, titled "Lavados por semana":
```tsx
{datosLavadoPorSemana.length > 0 && (
  <div className="rise">
    <h2 className="mb-2 text-sm font-semibold text-ink">Lavados por semana</h2>
    <div className="flex h-32 items-end gap-1">
      {datosLavadoPorSemana.map((d) => {
        const maximo = Math.max(...datosLavadoPorSemana.map((x) => x.cantidadTotal), 1)
        return (
          <div
            key={d.semana}
            title={`${d.semana}: ${d.cantidadTotal} animales (${d.vecesVendido} ventas)`}
            className="flex-1 rounded-t bg-accent"
            style={{ height: `${Math.max(4, (d.cantidadTotal / maximo) * 100)}%` }}
          />
        )
      })}
    </div>
  </div>
)}
```

- [ ] **Step 4: Manually verify the reportes page**

Run `npm run dev`, go to `/reportes`, confirm the "Lavados por semana" chart renders with a bar for the week the Task 6 test sale was registered in (assuming that sale included the Lavado service — if not, register one more test sale with Lavado to see a non-zero bar).

- [ ] **Step 5: Add sidebar navigation entries**

In `components/Sidebar.tsx`, add two icon components near the existing ones (e.g. after `IconStock`):
```typescript
function IconVentas() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="1.6">
      <circle cx="8" cy="16" r="1" />
      <circle cx="14" cy="16" r="1" />
      <path d="M2.5 3.5h2l1.6 9.4a1.5 1.5 0 0 0 1.5 1.3h6.6a1.5 1.5 0 0 0 1.5-1.2l1.3-6.5H5.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconServicios() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 3v3M10 14v3M3 10h3M14 10h3" strokeLinecap="round" />
      <circle cx="10" cy="10" r="3.2" />
    </svg>
  )
}
```

In the `GRUPOS` array, add `Servicios` to the `General` group's `links` (right after `Productos`) and `Ventas` to the `Operación` group's `links` (right after `Compras`):
```typescript
{
  titulo: 'General',
  links: [
    { href: '/', label: 'Inicio', Icono: IconInicio },
    { href: '/proveedores', label: 'Proveedores', Icono: IconProveedores },
    { href: '/productos', label: 'Productos', Icono: IconProductos },
    { href: '/servicios', label: 'Servicios', Icono: IconServicios },
  ],
},
{
  titulo: 'Operación',
  links: [
    { href: '/compras', label: 'Compras', Icono: IconCompras },
    { href: '/ventas', label: 'Ventas', Icono: IconVentas },
    { href: '/stock', label: 'Stock', Icono: IconStock },
    { href: '/comparador', label: 'Comparador', Icono: IconComparador, soloAdmin: true },
    { href: '/reposicion', label: 'Reposición', Icono: IconReposicion, soloAdmin: true },
  ],
},
```

- [ ] **Step 6: Manually verify navigation**

Run `npm run dev`, confirm "Servicios" appears under "General" and "Ventas" appears under "Operación" in the sidebar, and both links navigate correctly for a logged-in empleado (not just admin — these are not `soloAdmin` entries).

- [ ] **Step 7: Verify the full test suite and type-check**

Run: `npm test && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/page.tsx" "app/(app)/reportes/page.tsx" components/Sidebar.tsx
git commit -m "feat: surface ingreso/neto on dashboard, lavado frequency on reportes, and nav entries"
```
