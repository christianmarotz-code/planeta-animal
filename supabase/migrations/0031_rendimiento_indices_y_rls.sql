-- Rendimiento (avisos de Supabase). No cambia quién puede hacer qué.
--
-- 1. Índices en las claves foráneas que no tenían uno. Sin ellos, borrar o buscar por
--    producto, factura o venta obliga a recorrer toda la tabla hija; se nota al crecer.
-- 2. Políticas RLS: `auth.uid()` se recalculaba por cada fila. Envuelto en `(select ...)`
--    Postgres lo evalúa una sola vez por consulta. El resultado es idéntico.

-- ── 1. Índices ─────────────────────────────────────────────────────────────
create index if not exists entradas_stock_sugeridas_confirmada_por_idx on public.entradas_stock_sugeridas (confirmada_por);
create index if not exists entradas_stock_sugeridas_factura_id_idx on public.entradas_stock_sugeridas (factura_id);
create index if not exists entradas_stock_sugeridas_producto_id_idx on public.entradas_stock_sugeridas (producto_id);
create index if not exists facturas_compra_created_by_idx on public.facturas_compra (created_by);
create index if not exists gastos_created_by_idx on public.gastos (created_by);
create index if not exists items_factura_factura_id_idx on public.items_factura (factura_id);
create index if not exists items_factura_producto_id_idx on public.items_factura (producto_id);
create index if not exists items_venta_producto_id_idx on public.items_venta (producto_id);
create index if not exists items_venta_servicio_id_idx on public.items_venta (servicio_id);
create index if not exists items_venta_venta_id_idx on public.items_venta (venta_id);
create index if not exists movimientos_stock_factura_id_idx on public.movimientos_stock (factura_id);
create index if not exists movimientos_stock_producto_id_idx on public.movimientos_stock (producto_id);
create index if not exists movimientos_stock_usuario_id_idx on public.movimientos_stock (usuario_id);
create index if not exists movimientos_stock_venta_id_idx on public.movimientos_stock (venta_id);
create index if not exists precios_proveedor_producto_id_idx on public.precios_proveedor (producto_id);
create index if not exists ventas_cliente_id_idx on public.ventas (cliente_id);
create index if not exists ventas_created_by_idx on public.ventas (created_by);

-- ── 2. Políticas RLS ───────────────────────────────────────────────────────
-- Reescribe cada política que usa `auth.uid()` sin envolver. Conserva roles, comando
-- y condiciones; solo cambia la forma de evaluar el usuario.
do $$
declare
  p record;
  usando text;
  con_check text;
begin
  for p in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') like '%auth.uid()%' or coalesce(with_check, '') like '%auth.uid()%')
      and coalesce(qual, '') not like '%(select auth.uid())%'
      and coalesce(with_check, '') not like '%(select auth.uid())%'
  loop
    usando := case when p.qual is null then '' else
      format(' using (%s)', replace(p.qual, 'auth.uid()', '(select auth.uid())')) end;
    con_check := case when p.with_check is null then '' else
      format(' with check (%s)', replace(p.with_check, 'auth.uid()', '(select auth.uid())')) end;
    execute format('alter policy %I on public.%I%s%s', p.policyname, p.tablename, usando, con_check);
  end loop;
end $$;
