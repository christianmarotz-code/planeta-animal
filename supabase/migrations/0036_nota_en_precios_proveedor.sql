-- Nota de promoción por precio y registro de sus cambios.
-- Spec: docs/superpowers/specs/2026-10-22-comparador-por-proveedor-design.md
begin;

alter table public.precios_proveedor
  add column nota text check (nota is null or char_length(nota) <= 200);

-- La auditoría de precios ahora también registra los cambios de nota.
create or replace function public.auditar_cambio_precio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text;
  v_id uuid;
  v_proveedor uuid;
  v_producto_id uuid;
  v_anterior numeric;
  v_nuevo numeric;
  v_nota_anterior text;
  v_nota_nueva text;
  v_producto text;
begin
  if tg_op = 'DELETE' then
    v_id := old.id; v_proveedor := old.proveedor_id; v_producto_id := old.producto_id;
    v_anterior := old.precio; v_nuevo := null;
    v_nota_anterior := old.nota; v_nota_nueva := null;
  elsif tg_op = 'INSERT' then
    v_id := new.id; v_proveedor := new.proveedor_id; v_producto_id := new.producto_id;
    v_anterior := null; v_nuevo := new.precio;
    v_nota_anterior := null; v_nota_nueva := new.nota;
  else
    if new.precio is not distinct from old.precio and new.nota is not distinct from old.nota then
      return null;
    end if;
    v_id := new.id; v_proveedor := new.proveedor_id; v_producto_id := new.producto_id;
    v_anterior := old.precio; v_nuevo := new.precio;
    v_nota_anterior := old.nota; v_nota_nueva := new.nota;
  end if;

  select nombre into v_nombre from public.perfiles where id = auth.uid();
  select nombre into v_producto from public.productos where id = v_producto_id;

  insert into public.registro_cambios (usuario_id, usuario_nombre, tabla, registro_id, operacion, proveedor_id, detalle)
  values (
    auth.uid(), coalesce(v_nombre, 'Sistema'), 'precios_proveedor', v_id, lower(tg_op), v_proveedor,
    jsonb_build_object('producto_id', v_producto_id, 'producto', v_producto,
                       'precio_anterior', v_anterior, 'precio_nuevo', v_nuevo,
                       'nota_anterior', v_nota_anterior, 'nota_nueva', v_nota_nueva)
  );
  return null;
end
$$;

commit;
