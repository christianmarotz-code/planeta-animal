-- registrar_factura_compra (0002), anular_factura_compra (0004) y
-- editar_factura_compra (0018) tenían cada una su propia copia de "aplicar
-- items al stock" y/o "revertir el stock de una factura" — misma lógica
-- reimplementada tres veces. Esta migración la extrae a dos funciones
-- privadas y hace que las tres RPCs las llamen.
--
-- De paso corrige un bug real que la nueva editar_factura_compra deja
-- alcanzable: el revert de anular_factura_compra sumaba solo las filas
-- movimientos_stock con tipo='entrada_compra' de la factura. Si la factura
-- ya había sido corregida antes con "Corregir factura" (editar_factura_compra
-- inserta una fila 'entrada_compra' nueva en cada corrección, sin borrar ni
-- reetiquetar las anteriores), anular_factura_compra revertía TODAS esas
-- entradas acumuladas en vez de solo el neto vigente, dejando stock_actual
-- descuadrado. El fix es el mismo que se aplicó en editar_factura_compra:
-- revertir el neto de todos los movimientos de la factura, no solo los de
-- tipo 'entrada_compra'.

create or replace function _revertir_stock_factura(p_factura_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov record;
begin
  for v_mov in
    select producto_id, sum(cantidad) as cantidad from public.movimientos_stock
    where factura_id = p_factura_id
    group by producto_id
  loop
    if v_mov.cantidad <> 0 then
      insert into public.movimientos_stock (producto_id, tipo, cantidad, factura_id, motivo, usuario_id)
      values (v_mov.producto_id, 'ajuste_manual', -v_mov.cantidad, p_factura_id, p_motivo, auth.uid());

      update public.productos
      set stock_actual = stock_actual - v_mov.cantidad
      where id = v_mov.producto_id;
    end if;
  end loop;
end;
$$;

revoke execute on function _revertir_stock_factura(uuid, text) from public;
revoke execute on function _revertir_stock_factura(uuid, text) from authenticated;

create or replace function _aplicar_items_factura(p_factura_id uuid, p_items jsonb, p_motivo text)
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
begin
  for v_item in select * from jsonb_array_elements(p_items)
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
    values (v_producto_id, 'entrada_compra', v_cantidad_stock, p_factura_id, p_motivo, auth.uid());

    update public.productos
    set stock_actual = stock_actual + v_cantidad_stock,
        costo_unitario_actual = v_costo_stock
    where id = v_producto_id;
  end loop;
end;
$$;

revoke execute on function _aplicar_items_factura(uuid, jsonb, text) from public;
revoke execute on function _aplicar_items_factura(uuid, jsonb, text) from authenticated;

create or replace function registrar_factura_compra(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_factura_id uuid;
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

  perform _aplicar_items_factura(v_factura_id, payload->'items', 'Registro de compra');

  return v_factura_id;
end;
$$;

create or replace function anular_factura_compra(p_factura_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if (select estado from public.facturas_compra where id = p_factura_id) = 'anulada' then
    raise exception 'La factura ya está anulada';
  end if;

  update public.facturas_compra set estado = 'anulada' where id = p_factura_id;

  perform _revertir_stock_factura(p_factura_id, 'Anulación de factura');
end;
$$;

create or replace function editar_factura_compra(p_factura_id uuid, payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

  perform _revertir_stock_factura(p_factura_id, 'Corrección manual de factura');

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

  perform _aplicar_items_factura(p_factura_id, payload->'items', 'Corrección manual de factura');
end;
$$;
