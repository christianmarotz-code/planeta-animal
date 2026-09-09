-- Costo real por proveedor: cada proveedor puede tener Ingresos Brutos
-- (II.BB.), Percepción de IVA, y/o un descuento por pronto pago que
-- ajustan el costo neto de cada línea de factura a un "costo real".
-- Ese costo real (no el neto) es el que pasa a valuar el stock, así
-- costo_unitario_actual y los reportes reflejan el costo verdadero.

alter table proveedores
  add column aplica_iibb boolean not null default false,
  add column tasa_iibb numeric not null default 4,
  add column aplica_perc_iva boolean not null default false,
  add column tasa_perc_iva numeric not null default 3,
  add column descuento_pronto_pago numeric not null default 0;

create or replace function registrar_factura_compra(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_factura_id uuid;
  v_proveedor_id uuid;
  v_item jsonb;
  v_producto_id uuid;
  v_cantidad numeric;
  v_costo_unitario numeric;
  v_alicuota_iva numeric;
  v_subtotal_item numeric;
  v_factor_conversion numeric;
  v_cantidad_stock numeric;
  v_costo_stock numeric;
  v_aplica_iibb boolean;
  v_tasa_iibb numeric;
  v_aplica_perc_iva boolean;
  v_tasa_perc_iva numeric;
  v_descuento numeric;
  v_factor_ajuste numeric;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  v_proveedor_id := (payload->>'proveedor_id')::uuid;

  select aplica_iibb, tasa_iibb, aplica_perc_iva, tasa_perc_iva, descuento_pronto_pago
  into v_aplica_iibb, v_tasa_iibb, v_aplica_perc_iva, v_tasa_perc_iva, v_descuento
  from public.proveedores where id = v_proveedor_id;

  insert into public.facturas_compra (
    proveedor_id, numero_comprobante, tipo_comprobante, fecha,
    subtotal, iva_total, total, archivo_adjunto, notas, created_by
  )
  values (
    v_proveedor_id,
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

    v_factor_ajuste := 1 + (v_alicuota_iva / 100);
    if v_aplica_iibb then
      v_factor_ajuste := v_factor_ajuste + (v_tasa_iibb / 100);
    end if;
    if v_aplica_perc_iva then
      v_factor_ajuste := v_factor_ajuste + (v_tasa_perc_iva / 100);
    end if;
    v_factor_ajuste := v_factor_ajuste * (1 - (v_descuento / 100));

    v_costo_stock := (v_costo_unitario * v_factor_ajuste) / v_factor_conversion;

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

revoke execute on function registrar_factura_compra(jsonb) from public;
grant execute on function registrar_factura_compra(jsonb) to authenticated;

-- Proveedores reales de la veterinaria, con su configuración de
-- impuestos/descuentos extraída de "Costo unitario en factura.xlsx".
-- El descuento combina, cuando el Excel aplicaba más de uno multiplicativamente
-- (ej. pronto pago + descuento adicional), en un único porcentaje equivalente.
-- NOTA: correr este INSERT una sola vez — no tiene protección contra duplicados
-- (no hay una columna única en "nombre"), así que ejecutarlo dos veces crea
-- proveedores repetidos.
insert into proveedores (nombre, aplica_iibb, tasa_iibb, aplica_perc_iva, tasa_perc_iva, descuento_pronto_pago, notas)
values
  ('Arana', true, 4, false, 3, 10, 'Config. importada del Excel de costos.'),
  ('Bichos', false, 4, false, 3, 0, 'Config. importada del Excel de costos.'),
  ('Bruncas', true, 4, false, 0.5, 18.3, 'Config. importada del Excel de costos (combina 5% pronto pago + 14% descuento adicional).'),
  ('Arcuri', true, 4, false, 3, 5, 'Config. importada del Excel de costos.'),
  ('Panacea', false, 4, false, 3, 14.5, 'Config. importada del Excel de costos (combina 5% + 10%).'),
  ('Don Orione', false, 4, false, 3, 0, 'Config. importada del Excel de costos.'),
  ('Grupo Insigne', true, 4, false, 3, 0, 'Config. importada del Excel de costos.'),
  ('Krönen', true, 4, false, 3, 5, 'Config. importada del Excel de costos.'),
  ('La Sin Rival', false, 4, false, 3, 0, 'Config. importada del Excel de costos.'),
  ('Nestlé', true, 4, true, 3, 0, 'Config. importada del Excel de costos.'),
  ('Vital Can', true, 4, false, 3, 3.5, 'Config. importada del Excel de costos.');
