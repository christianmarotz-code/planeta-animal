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
