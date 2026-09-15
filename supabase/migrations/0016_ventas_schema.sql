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
-- Excepción al criterio de arriba: el alta de clientes la hace cualquier
-- usuario logueado, porque /ventas/nueva permite dar de alta un cliente
-- ocasional sin salir del flujo de venta y esa pantalla no está restringida a
-- administradores. Editar o borrar un cliente sí sigue siendo admin-only.
create policy "clientes_insertar_autenticado" on clientes
  for insert to authenticated
  with check (true);
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
