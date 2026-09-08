create or replace function ajustar_stock_manual(
  p_producto_id uuid,
  p_cantidad numeric,
  p_motivo text
)
returns void
language plpgsql
security definer
as $$
begin
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'El motivo del ajuste es obligatorio';
  end if;

  insert into movimientos_stock (producto_id, tipo, cantidad, motivo, usuario_id)
  values (p_producto_id, 'ajuste_manual', p_cantidad, p_motivo, auth.uid());

  update productos
  set stock_actual = stock_actual + p_cantidad
  where id = p_producto_id;
end;
$$;
