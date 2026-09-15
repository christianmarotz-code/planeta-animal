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
