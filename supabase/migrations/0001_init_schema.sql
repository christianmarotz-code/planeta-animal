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
