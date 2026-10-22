-- Permite eliminar usuarios que ya cargaron datos: las columnas que guardan
-- "quién lo cargó" (created_by, usuario_id, confirmada_por) pasan a quedar en
-- null al borrar el usuario, en vez de bloquear el borrado. El historial se conserva.
do $$
declare
  fk record;
begin
  for fk in
    select
      c.conrelid::regclass as tabla,
      c.conname as nombre,
      a.attname as columna
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and c.confdeltype = 'a' -- NO ACTION: bloquea el borrado
      and c.connamespace = 'public'::regnamespace
  loop
    execute format('alter table %s drop constraint %I', fk.tabla, fk.nombre);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references auth.users(id) on delete set null',
      fk.tabla, fk.nombre, fk.columna
    );
  end loop;
end $$;
