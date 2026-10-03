-- Carga inteligente de boletas (sub-proyecto A). Migración ADITIVA: ninguna
-- columna ni dato existente se borra; las facturas viejas quedan con los
-- campos nuevos en null y es_fiscal = true.
--
-- Cambio de comportamiento: registrar/editar factura YA NO suma stock. Genera
-- una "entrada sugerida" que confirma quien recibe la mercadería
-- (confirmar_entrada_stock), porque pueden faltar productos o llegar bolsas
-- rotas. El costo del producto sí se actualiza al registrar la factura.
-- Las condiciones comerciales (IIBB, percepción IVA, pronto pago) ya viven en
-- proveedores desde la 0005 y no se duplican acá.

-- ── Proveedores ────────────────────────────────────────────────────────────
alter table proveedores
  add column if not exists razon_social text,
  add column if not exists alias text[] not null default '{}',
  add column if not exists tipos_comprobante text[] not null default '{}',
  add column if not exists condicion_pago_habitual text,
  add column if not exists formato_habitual text,
  add column if not exists primera_boleta date,
  add column if not exists ultima_boleta date,
  add column if not exists cantidad_boletas integer not null default 0,
  add column if not exists total_acumulado numeric not null default 0,
  add column if not exists activo boolean not null default true;

-- No único a propósito: puede haber CUITs repetidos ya cargados. La app
-- detecta el duplicado y propone unir proveedores.
create index if not exists proveedores_cuit_idx on proveedores (cuit) where cuit is not null;

-- ── Facturas ───────────────────────────────────────────────────────────────
alter table facturas_compra drop constraint if exists facturas_compra_tipo_comprobante_check;
alter table facturas_compra add constraint facturas_compra_tipo_comprobante_check check (
  tipo_comprobante in (
    'Factura A', 'Factura B', 'Factura C', 'Remito', 'Nota de Credito',
    'Ticket Factura', 'Presupuesto X', 'Pedido X', 'Comprobante Interno'
  )
);
alter table facturas_compra drop constraint if exists facturas_compra_estado_check;
alter table facturas_compra add constraint facturas_compra_estado_check check (
  estado in ('cargada', 'anulada', 'revision')
);

alter table facturas_compra
  add column if not exists es_fiscal boolean not null default true,
  add column if not exists condicion_pago text,
  add column if not exists vencimiento date,
  add column if not exists cae text,
  add column if not exists cae_vto date,
  add column if not exists pedido text,
  add column if not exists remito text,
  add column if not exists orden_compra text,
  add column if not exists percepciones_total numeric not null default 0,
  add column if not exists ajuste_redondeo numeric not null default 0,
  add column if not exists total_calculado numeric,
  add column if not exists hash_imagen text,
  add column if not exists impuestos jsonb not null default '[]'::jsonb;

create index if not exists facturas_compra_hash_idx on facturas_compra (hash_imagen) where hash_imagen is not null;
create index if not exists facturas_compra_clave_idx on facturas_compra (proveedor_id, tipo_comprobante, numero_comprobante);

-- ── Ítems ──────────────────────────────────────────────────────────────────
alter table items_factura alter column producto_id drop not null;
alter table items_factura drop constraint if exists items_factura_costo_unitario_check;
alter table items_factura add constraint items_factura_costo_unitario_check check (costo_unitario >= 0);

alter table items_factura
  add column if not exists codigo_proveedor text,
  add column if not exists descripcion_original text,
  add column if not exists precio_lista numeric,
  add column if not exists bonificaciones jsonb not null default '[]'::jsonb,
  add column if not exists neto_linea numeric,
  add column if not exists iva_monto numeric,
  add column if not exists percepciones jsonb not null default '[]'::jsonb,
  add column if not exists total_linea numeric,
  add column if not exists precio_final_unitario numeric,
  add column if not exists es_regalo boolean not null default false,
  add column if not exists leyenda_regalo text;

-- ── Entradas de stock sugeridas ────────────────────────────────────────────
create table if not exists entradas_stock_sugeridas (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid not null references facturas_compra(id) on delete cascade,
  producto_id uuid not null references productos(id),
  cantidad_sugerida numeric not null check (cantidad_sugerida > 0),
  cantidad_recibida numeric check (cantidad_recibida >= 0),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'confirmada')),
  nota text,
  confirmada_por uuid references auth.users(id),
  confirmada_en timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists entradas_stock_pendientes_idx on entradas_stock_sugeridas (estado) where estado = 'pendiente';

alter table entradas_stock_sugeridas enable row level security;
-- Solo lectura directa; las escrituras pasan por funciones security definer.
create policy "entradas_stock_lectura" on entradas_stock_sugeridas
  for select to authenticated using (true);

-- ── Estadísticas del proveedor (se recalculan, nunca se acumulan a mano) ───
create or replace function _recalcular_stats_proveedor(p_proveedor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.proveedores p
  set cantidad_boletas = s.cant,
      total_acumulado = s.total,
      primera_boleta = s.primera,
      ultima_boleta = s.ultima,
      tipos_comprobante = s.tipos
  from (
    select count(*)::integer as cant,
           coalesce(sum(total) filter (where es_fiscal), 0) as total,
           min(fecha) as primera,
           max(fecha) as ultima,
           coalesce(array_agg(distinct tipo_comprobante), '{}') as tipos
    from public.facturas_compra
    where proveedor_id = p_proveedor_id and estado <> 'anulada'
  ) s
  where p.id = p_proveedor_id;
end;
$$;
revoke execute on function _recalcular_stats_proveedor(uuid) from public;
revoke execute on function _recalcular_stats_proveedor(uuid) from authenticated;

-- ── Revertir: ahora también descarta las entradas sugeridas ────────────────
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

  -- Pendientes: nunca sumaron stock. Confirmadas: su movimiento ya se revirtió arriba.
  delete from public.entradas_stock_sugeridas where factura_id = p_factura_id;
end;
$$;

-- ── Aplicar ítems: guarda el detalle y SUGIERE la entrada, no suma stock ───
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
  v_neto numeric;
  v_es_regalo boolean;
  v_es_fiscal boolean;
  v_factor_conversion numeric;
begin
  select es_fiscal into v_es_fiscal from public.facturas_compra where id = p_factura_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := nullif(v_item->>'producto_id', '')::uuid;
    v_cantidad := (v_item->>'cantidad')::numeric;
    v_costo_unitario := coalesce((v_item->>'costo_unitario')::numeric, 0);
    v_alicuota_iva := coalesce((v_item->>'alicuota_iva')::numeric, 21);
    v_es_regalo := coalesce((v_item->>'es_regalo')::boolean, false);
    v_neto := coalesce((v_item->>'neto_linea')::numeric, v_cantidad * v_costo_unitario);

    insert into public.items_factura (
      factura_id, producto_id, cantidad, costo_unitario, alicuota_iva, subtotal,
      codigo_proveedor, descripcion_original, precio_lista, bonificaciones,
      neto_linea, iva_monto, percepciones, total_linea, precio_final_unitario,
      es_regalo, leyenda_regalo
    )
    values (
      p_factura_id, v_producto_id, v_cantidad, v_costo_unitario, v_alicuota_iva, v_neto,
      v_item->>'codigo_proveedor',
      v_item->>'descripcion_original',
      (v_item->>'precio_lista')::numeric,
      coalesce(v_item->'bonificaciones', '[]'::jsonb),
      v_neto,
      (v_item->>'iva_monto')::numeric,
      coalesce(v_item->'percepciones', '[]'::jsonb),
      (v_item->>'total_linea')::numeric,
      (v_item->>'precio_final_unitario')::numeric,
      v_es_regalo,
      v_item->>'leyenda_regalo'
    );

    -- Sin producto vinculado o documento no fiscal: no hay stock ni costo que tocar.
    if v_producto_id is null or not v_es_fiscal then
      continue;
    end if;

    select factor_conversion into v_factor_conversion
    from public.productos where id = v_producto_id;

    insert into public.entradas_stock_sugeridas (factura_id, producto_id, cantidad_sugerida)
    values (p_factura_id, v_producto_id, v_cantidad * v_factor_conversion);

    -- Los regalos no cuentan para el costo del producto.
    if not v_es_regalo and v_costo_unitario > 0 then
      update public.productos
      set costo_unitario_actual = v_costo_unitario / v_factor_conversion
      where id = v_producto_id;
    end if;
  end loop;
end;
$$;

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

  perform _aplicar_items_factura(v_factura_id, payload->'items', 'Registro de compra');
  perform _recalcular_stats_proveedor(v_proveedor_id);

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

  perform _revertir_stock_factura(p_factura_id, 'Anulación de factura');
  perform _recalcular_stats_proveedor(v_proveedor_id);
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

  perform _revertir_stock_factura(p_factura_id, 'Corrección manual de factura');

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

  perform _aplicar_items_factura(p_factura_id, payload->'items', 'Corrección manual de factura');

  perform _recalcular_stats_proveedor(v_proveedor_nuevo);
  if v_proveedor_anterior is distinct from v_proveedor_nuevo then
    perform _recalcular_stats_proveedor(v_proveedor_anterior);
  end if;
end;
$$;

-- ── Confirmar una entrada: acá recién se suma el stock ─────────────────────
create or replace function confirmar_entrada_stock(
  p_entrada_id uuid,
  p_cantidad_recibida numeric,
  p_nota text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entrada record;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if p_cantidad_recibida is null or p_cantidad_recibida < 0 then
    raise exception 'Cantidad recibida inválida';
  end if;

  select * into v_entrada from public.entradas_stock_sugeridas where id = p_entrada_id for update;
  if not found then
    raise exception 'Entrada inexistente';
  end if;
  if v_entrada.estado <> 'pendiente' then
    raise exception 'La entrada ya fue confirmada';
  end if;

  update public.entradas_stock_sugeridas
  set estado = 'confirmada', cantidad_recibida = p_cantidad_recibida, nota = p_nota,
      confirmada_por = auth.uid(), confirmada_en = now()
  where id = p_entrada_id;

  if p_cantidad_recibida > 0 then
    insert into public.movimientos_stock (producto_id, tipo, cantidad, factura_id, motivo, usuario_id)
    values (
      v_entrada.producto_id, 'entrada_compra', p_cantidad_recibida, v_entrada.factura_id,
      coalesce(p_nota, 'Recepción de mercadería'), auth.uid()
    );

    update public.productos
    set stock_actual = stock_actual + p_cantidad_recibida
    where id = v_entrada.producto_id;
  end if;
end;
$$;

revoke execute on function confirmar_entrada_stock(uuid, numeric, text) from public;
grant execute on function confirmar_entrada_stock(uuid, numeric, text) to authenticated;
