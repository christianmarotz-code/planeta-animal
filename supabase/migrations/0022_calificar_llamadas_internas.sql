-- Corrección sobre la 0020 (y sobre la 0019, que tenía el mismo patrón): estas
-- funciones corren con search_path vacío (hardening de la 0004), así que las
-- llamadas a otras funciones del esquema deben ir calificadas con "public.".
-- Se detectó probando registrar_factura_compra dentro de una transacción
-- revertida: "function _aplicar_items_factura(uuid, jsonb, unknown) does not exist".

-- ── Registrar ──────────────────────────────────────────────────────────────
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
    total_calculado, hash_imagen, impuestos
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
    coalesce(payload->'impuestos', '[]'::jsonb)
  )
  returning id into v_factura_id;

  perform public._aplicar_items_factura(v_factura_id, payload->'items', 'Registro de compra');
  perform public._recalcular_stats_proveedor(v_proveedor_id);

  return v_factura_id;
end;
$$;

-- ── Anular ─────────────────────────────────────────────────────────────────
create or replace function anular_factura_compra(p_factura_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proveedor_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if (select estado from public.facturas_compra where id = p_factura_id) = 'anulada' then
    raise exception 'La factura ya está anulada';
  end if;

  update public.facturas_compra set estado = 'anulada'
  where id = p_factura_id
  returning proveedor_id into v_proveedor_id;

  perform public._revertir_stock_factura(p_factura_id, 'Anulación de factura');
  perform public._recalcular_stats_proveedor(v_proveedor_id);
end;
$$;

-- ── Editar ─────────────────────────────────────────────────────────────────
create or replace function editar_factura_compra(p_factura_id uuid, payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proveedor_anterior uuid;
  v_proveedor_nuevo uuid := (payload->>'proveedor_id')::uuid;
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

  select proveedor_id into v_proveedor_anterior from public.facturas_compra where id = p_factura_id;

  perform public._revertir_stock_factura(p_factura_id, 'Corrección manual de factura');

  delete from public.items_factura where factura_id = p_factura_id;

  update public.facturas_compra
  set proveedor_id = v_proveedor_nuevo,
      numero_comprobante = payload->>'numero_comprobante',
      tipo_comprobante = payload->>'tipo_comprobante',
      fecha = (payload->>'fecha')::date,
      subtotal = (payload->>'subtotal')::numeric,
      iva_total = (payload->>'iva_total')::numeric,
      total = (payload->>'total')::numeric,
      -- Campos nuevos: si el payload no los trae (editor viejo), se conservan.
      estado = coalesce(nullif(payload->>'estado', ''), estado),
      es_fiscal = coalesce((payload->>'es_fiscal')::boolean, es_fiscal),
      condicion_pago = coalesce(payload->>'condicion_pago', condicion_pago),
      vencimiento = coalesce(nullif(payload->>'vencimiento', '')::date, vencimiento),
      cae = coalesce(payload->>'cae', cae),
      cae_vto = coalesce(nullif(payload->>'cae_vto', '')::date, cae_vto),
      pedido = coalesce(payload->>'pedido', pedido),
      remito = coalesce(payload->>'remito', remito),
      orden_compra = coalesce(payload->>'orden_compra', orden_compra),
      percepciones_total = coalesce((payload->>'percepciones_total')::numeric, percepciones_total),
      ajuste_redondeo = coalesce((payload->>'ajuste_redondeo')::numeric, ajuste_redondeo),
      total_calculado = coalesce((payload->>'total_calculado')::numeric, total_calculado),
      impuestos = coalesce(payload->'impuestos', impuestos)
  where id = p_factura_id;

  perform public._aplicar_items_factura(p_factura_id, payload->'items', 'Corrección manual de factura');

  perform public._recalcular_stats_proveedor(v_proveedor_nuevo);
  if v_proveedor_anterior is distinct from v_proveedor_nuevo then
    perform public._recalcular_stats_proveedor(v_proveedor_anterior);
  end if;
end;
$$;

