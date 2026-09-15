-- RPCs de ventas.
--
-- Endurecidas con el mismo criterio que 0004_rpc_security_hardening.sql aplicó
-- a las RPC de compras:
--   1. `set search_path = ''` + referencias de tabla calificadas con `public.`.
--   2. Guarda explícita `auth.uid() is null` al inicio de cada función.
--   3. `revoke execute ... from public` + `grant execute ... to authenticated`
--      al final del archivo (Postgres otorga EXECUTE a PUBLIC por defecto, que
--      Supabase/PostgREST expone al rol `anon` sin autenticar).
--   4. `anular_venta` es idempotente: falla si la venta ya está anulada, en vez
--      de revertir el stock una segunda vez.
--   5. `registrar_venta` calcula subtotal/total a partir de los ítems (nunca
--      confía en los totales del payload) y exige al menos un ítem.

create or replace function registrar_venta(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
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
  v_subtotal_total numeric := 0;
  v_costo_actual numeric;
  v_stock_actual numeric;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if coalesce(jsonb_array_length(payload->'items'), 0) = 0 then
    raise exception 'La venta debe tener al menos un ítem';
  end if;

  -- Totales provisorios: se recalculan desde los ítems al final.
  insert into public.ventas (
    cliente_id, fecha, medio_pago, subtotal, iva_total, total, notas, created_by
  )
  values (
    nullif(payload->>'cliente_id', '')::uuid,
    (payload->>'fecha')::date,
    payload->>'medio_pago',
    0,
    0,
    0,
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
    v_subtotal_total := v_subtotal_total + v_subtotal_item;

    if v_tipo = 'producto' then
      v_producto_id := (v_item->>'producto_id')::uuid;

      select stock_actual, costo_unitario_actual into v_stock_actual, v_costo_actual
      from public.productos where id = v_producto_id
      for update;

      if v_stock_actual is null then
        raise exception 'Producto % no encontrado', v_producto_id;
      end if;
      if v_stock_actual < v_cantidad then
        raise exception 'Stock insuficiente para el producto %', v_producto_id;
      end if;

      insert into public.items_venta (
        venta_id, tipo, producto_id, servicio_id, cantidad, precio_unitario,
        costo_unitario_snapshot, subtotal
      )
      values (
        v_venta_id, 'producto', v_producto_id, null, v_cantidad, v_precio_unitario,
        v_costo_actual, v_subtotal_item
      );

      insert into public.movimientos_stock (producto_id, tipo, cantidad, venta_id, usuario_id)
      values (v_producto_id, 'salida_venta', -v_cantidad, v_venta_id, auth.uid());

      update public.productos
      set stock_actual = stock_actual - v_cantidad
      where id = v_producto_id;
    else
      v_servicio_id := (v_item->>'servicio_id')::uuid;

      insert into public.items_venta (
        venta_id, tipo, producto_id, servicio_id, cantidad, precio_unitario,
        costo_unitario_snapshot, subtotal
      )
      values (
        v_venta_id, 'servicio', null, v_servicio_id, v_cantidad, v_precio_unitario,
        null, v_subtotal_item
      );
    end if;
  end loop;

  -- Los totales persistidos siempre son la suma real de items_venta.subtotal.
  -- iva_total queda en 0: esta fase no discrimina IVA (restricción global).
  update public.ventas
  set subtotal = v_subtotal_total,
      iva_total = 0,
      total = v_subtotal_total
  where id = v_venta_id;

  return v_venta_id;
end;
$$;

create or replace function anular_venta(p_venta_id uuid)
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

  if (select estado from public.ventas where id = p_venta_id) = 'anulada' then
    raise exception 'La venta ya está anulada';
  end if;

  update public.ventas set estado = 'anulada' where id = p_venta_id;

  for v_mov in
    select producto_id, cantidad from public.movimientos_stock
    where venta_id = p_venta_id and tipo = 'salida_venta'
  loop
    insert into public.movimientos_stock (producto_id, tipo, cantidad, venta_id, motivo, usuario_id)
    values (
      v_mov.producto_id, 'ajuste_manual', -v_mov.cantidad, p_venta_id,
      'Anulación de venta', auth.uid()
    );

    update public.productos
    set stock_actual = stock_actual - v_mov.cantidad
    where id = v_mov.producto_id;
  end loop;
end;
$$;

revoke execute on function registrar_venta(jsonb) from public;
grant execute on function registrar_venta(jsonb) to authenticated;

revoke execute on function anular_venta(uuid) from public;
grant execute on function anular_venta(uuid) to authenticated;
