-- Descuentos por pronto pago por factura (ej. "contado hasta 7 días 5%, de 8 a
-- 14 días 4%"). Se aplican sobre el total de la factura y cambian el costo real.
--   pronto_pago          → tramos: [{ "dias": 7, "descuento": 5 }, ...]
--   pronto_pago_elegido  → % del tramo con que se va a pagar (0 = sin descuento)
alter table facturas_compra
  add column if not exists pronto_pago jsonb not null default '[]'::jsonb,
  add column if not exists pronto_pago_elegido numeric not null default 0;

-- registrar_factura_compra: igual a la 0022 más los dos campos nuevos.
create or replace function registrar_factura_compra(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_factura_id uuid;
  v_proveedor_id uuid := (payload->>'proveedor_id')::uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  insert into public.facturas_compra (
    proveedor_id, numero_comprobante, tipo_comprobante, fecha,
    subtotal, iva_total, total, archivo_adjunto, notas, created_by,
    estado, es_fiscal, condicion_pago, vencimiento, cae, cae_vto,
    pedido, remito, orden_compra, percepciones_total, ajuste_redondeo,
    total_calculado, hash_imagen, impuestos, pronto_pago, pronto_pago_elegido
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
    auth.uid(),
    coalesce(nullif(payload->>'estado', ''), 'cargada'),
    coalesce((payload->>'es_fiscal')::boolean, true),
    payload->>'condicion_pago',
    nullif(payload->>'vencimiento', '')::date,
    payload->>'cae',
    nullif(payload->>'cae_vto', '')::date,
    payload->>'pedido',
    payload->>'remito',
    payload->>'orden_compra',
    coalesce((payload->>'percepciones_total')::numeric, 0),
    coalesce((payload->>'ajuste_redondeo')::numeric, 0),
    (payload->>'total_calculado')::numeric,
    payload->>'hash_imagen',
    coalesce(payload->'impuestos', '[]'::jsonb),
    coalesce(payload->'pronto_pago', '[]'::jsonb),
    coalesce((payload->>'pronto_pago_elegido')::numeric, 0)
  )
  returning id into v_factura_id;

  perform public._aplicar_items_factura(v_factura_id, payload->'items', 'Registro de compra');
  perform public._recalcular_stats_proveedor(v_proveedor_id);

  return v_factura_id;
end;
$$;

-- Cambiar el tramo de pronto pago de una factura ya cargada (solo administrador).
create or replace function cambiar_pronto_pago_factura(p_factura_id uuid, p_descuento numeric)
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
    raise exception 'Solo un administrador puede cambiar el pronto pago';
  end if;

  update public.facturas_compra
  set pronto_pago_elegido = coalesce(p_descuento, 0)
  where id = p_factura_id;
end;
$$;
