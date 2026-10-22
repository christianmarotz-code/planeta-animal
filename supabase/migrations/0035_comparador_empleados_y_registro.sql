-- Comparador y proveedores abiertos a empleados, con registro de quién hizo qué.
-- Spec: docs/superpowers/specs/2026-10-22-comparador-empleados-design.md
-- Todo en una transacción: si algo falla, no queda nada a medias.
begin;

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

commit;
