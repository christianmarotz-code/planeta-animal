-- Permite corregir una factura de compra ya guardada (por ejemplo cuando el
-- reconocimiento automático por foto leyó mal un dato). Sigue el mismo
-- patrón de seguridad que registrar_factura_compra / anular_factura_compra
-- (0002, 0004): security definer, search_path vacío, guard de auth.uid().
--
-- Implementación: revierte el stock que había sumado la carga original
-- (igual que anular_factura_compra), reemplaza los items y vuelve a aplicar
-- el nuevo stock (igual que registrar_factura_compra) — evita reinventar la
-- lógica de cálculo de stock en un tercer lugar.
--
-- A diferencia de anular_factura_compra (que solo puede correr una vez por
-- factura), esta función se puede llamar repetidas veces sobre la misma
-- factura. Por eso el revert no busca solo las filas 'entrada_compra': suma
-- el efecto neto de TODOS los movimientos_stock ya registrados para esta
-- factura (carga original + reversiones/reaplicaciones de ediciones
-- anteriores) y revierte ese neto. Si en cambio solo se revirtieran las
-- filas 'entrada_compra', una segunda corrección volvería a revertir la
-- carga original (que ya se había revertido en la primera corrección),
-- descuadrando el stock cada vez que se corrige la misma factura más de
-- una vez.

create or replace function editar_factura_compra(p_factura_id uuid, payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_producto_id uuid;
  v_cantidad numeric;
  v_costo_unitario numeric;
  v_alicuota_iva numeric;
  v_subtotal_item numeric;
  v_factor_conversion numeric;
  v_cantidad_stock numeric;
  v_costo_stock numeric;
  v_mov record;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not exists (select 1 from public.perfiles where id = auth.uid() and rol = 'administrador') then
    raise exception 'Solo un administrador puede corregir una factura';
  end if;

  if (select estado from public.facturas_compra where id = p_factura_id) = 'anulada' then
    raise exception 'No se puede editar una factura anulada';
  end if;

  -- Revertir el efecto neto que esta factura tiene hoy sobre el stock (ver
  -- comentario arriba: neto de todos los movimientos, no solo la carga
  -- original, para que corregir la misma factura varias veces no descuadre
  -- el stock).
  for v_mov in
    select producto_id, sum(cantidad) as cantidad from public.movimientos_stock
    where factura_id = p_factura_id
    group by producto_id
  loop
    if v_mov.cantidad <> 0 then
      insert into public.movimientos_stock (producto_id, tipo, cantidad, factura_id, motivo, usuario_id)
      values (
        v_mov.producto_id, 'ajuste_manual', -v_mov.cantidad, p_factura_id,
        'Corrección manual de factura', auth.uid()
      );

      update public.productos
      set stock_actual = stock_actual - v_mov.cantidad
      where id = v_mov.producto_id;
    end if;
  end loop;

  delete from public.items_factura where factura_id = p_factura_id;

  update public.facturas_compra
  set proveedor_id = (payload->>'proveedor_id')::uuid,
      numero_comprobante = payload->>'numero_comprobante',
      tipo_comprobante = payload->>'tipo_comprobante',
      fecha = (payload->>'fecha')::date,
      subtotal = (payload->>'subtotal')::numeric,
      iva_total = (payload->>'iva_total')::numeric,
      total = (payload->>'total')::numeric
  where id = p_factura_id;

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
      p_factura_id, v_producto_id, v_cantidad, v_costo_unitario, v_alicuota_iva, v_subtotal_item
    );

    select factor_conversion into v_factor_conversion
    from public.productos where id = v_producto_id;

    v_cantidad_stock := v_cantidad * v_factor_conversion;
    v_costo_stock := v_costo_unitario / v_factor_conversion;

    insert into public.movimientos_stock (producto_id, tipo, cantidad, factura_id, motivo, usuario_id)
    values (
      v_producto_id, 'entrada_compra', v_cantidad_stock, p_factura_id,
      'Corrección manual de factura', auth.uid()
    );

    update public.productos
    set stock_actual = stock_actual + v_cantidad_stock,
        costo_unitario_actual = v_costo_stock
    where id = v_producto_id;
  end loop;
end;
$$;

revoke execute on function editar_factura_compra(uuid, jsonb) from public;
grant execute on function editar_factura_compra(uuid, jsonb) to authenticated;
