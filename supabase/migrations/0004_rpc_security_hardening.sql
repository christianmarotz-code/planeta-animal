-- Security hardening for security-definer RPC functions.
--
-- Postgres grants EXECUTE on newly created functions to PUBLIC by default,
-- which Supabase/PostgREST exposes to the unauthenticated `anon` role. These
-- functions are `security definer`, so an unauthenticated caller with only
-- the public anon key could otherwise invoke them directly via REST.
--
-- This migration:
--   1. Revokes EXECUTE from PUBLIC and grants it only to `authenticated`.
--   2. Rewrites each function with `set search_path = ''` (the standard
--      Postgres/Supabase security-linter recommendation for security
--      definer functions), schema-qualifying every table reference.
--   3. Adds an explicit `auth.uid() is null` guard at the top of each
--      function body as defense in depth.
--   4. Makes `anular_factura_compra` idempotent: it now raises if the
--      factura is already anulada, instead of silently double-reversing
--      stock.
--   5. Adds a guard to `ajustar_stock_manual` that blocks any adjustment
--      that would drive stock_actual below zero.

create or replace function registrar_factura_compra(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
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
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  insert into public.facturas_compra (
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

    insert into public.items_factura (
      factura_id, producto_id, cantidad, costo_unitario, alicuota_iva, subtotal
    )
    values (
      v_factura_id, v_producto_id, v_cantidad, v_costo_unitario, v_alicuota_iva, v_subtotal_item
    );

    select factor_conversion into v_factor_conversion
    from public.productos where id = v_producto_id;

    v_cantidad_stock := v_cantidad * v_factor_conversion;
    v_costo_stock := v_costo_unitario / v_factor_conversion;

    insert into public.movimientos_stock (producto_id, tipo, cantidad, factura_id, usuario_id)
    values (v_producto_id, 'entrada_compra', v_cantidad_stock, v_factura_id, auth.uid());

    update public.productos
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
set search_path = ''
as $$
declare
  v_mov record;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if (select estado from public.facturas_compra where id = p_factura_id) = 'anulada' then
    raise exception 'La factura ya está anulada';
  end if;

  update public.facturas_compra set estado = 'anulada' where id = p_factura_id;

  for v_mov in
    select producto_id, cantidad from public.movimientos_stock
    where factura_id = p_factura_id and tipo = 'entrada_compra'
  loop
    insert into public.movimientos_stock (producto_id, tipo, cantidad, factura_id, motivo, usuario_id)
    values (
      v_mov.producto_id, 'ajuste_manual', -v_mov.cantidad, p_factura_id,
      'Anulación de factura', auth.uid()
    );

    update public.productos
    set stock_actual = stock_actual - v_mov.cantidad
    where id = v_mov.producto_id;
  end loop;
end;
$$;

create or replace function ajustar_stock_manual(
  p_producto_id uuid,
  p_cantidad numeric,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'El motivo del ajuste es obligatorio';
  end if;

  if (select stock_actual from public.productos where id = p_producto_id) + p_cantidad < 0 then
    raise exception 'El ajuste dejaría el stock en negativo';
  end if;

  insert into public.movimientos_stock (producto_id, tipo, cantidad, motivo, usuario_id)
  values (p_producto_id, 'ajuste_manual', p_cantidad, p_motivo, auth.uid());

  update public.productos
  set stock_actual = stock_actual + p_cantidad
  where id = p_producto_id;
end;
$$;

revoke execute on function registrar_factura_compra(jsonb) from public;
grant execute on function registrar_factura_compra(jsonb) to authenticated;

revoke execute on function anular_factura_compra(uuid) from public;
grant execute on function anular_factura_compra(uuid) to authenticated;

revoke execute on function ajustar_stock_manual(uuid, numeric, text) from public;
grant execute on function ajustar_stock_manual(uuid, numeric, text) to authenticated;
