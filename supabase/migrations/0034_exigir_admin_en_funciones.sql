-- Las funciones SECURITY DEFINER se saltean las políticas RLS, y estas tres solo
-- comprobaban que hubiera una sesión iniciada. Un empleado podía llamarlas directo a la
-- API (/rest/v1/rpc/...) aunque la pantalla las reserve a administradores.
--
-- Se agrega la comprobación de rol administrador a:
--   registrar_factura_compra, anular_factura_compra, anular_venta
-- Quedan abiertas a empleados (decisión del negocio): registrar_venta,
-- ajustar_stock_manual, confirmar_entrada_stock.
--
-- Cada función se reescribe a partir de su definición actual: si no encuentra el punto
-- donde insertar el chequeo, la migración falla entera y no cambia nada.
do $mig$
declare
  v_nombre text;
  v_original text;
  v_nuevo text;
begin
  foreach v_nombre in array array['registrar_factura_compra', 'anular_factura_compra', 'anular_venta']
  loop
    select pg_get_functiondef(p.oid) into v_original
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_nombre;

    if v_original is null then
      raise exception 'No existe la función %', v_nombre;
    end if;

    v_nuevo := regexp_replace(
      v_original,
      'if auth\.uid\(\) is null then\s+raise exception ''No autenticado'';\s+end if;',
      'if auth.uid() is null then raise exception ''No autenticado''; end if; '
        || 'if not exists (select 1 from public.perfiles where id = auth.uid() and rol = ''administrador'') '
        || 'then raise exception ''Solo un administrador puede hacer esto''; end if;'
    );

    if v_nuevo = v_original then
      raise exception 'No se pudo agregar el chequeo de administrador a %', v_nombre;
    end if;

    execute v_nuevo;
  end loop;
end
$mig$;
