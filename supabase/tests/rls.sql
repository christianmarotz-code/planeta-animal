-- Tests de seguridad de RLS y permisos. No dejan rastro: todo corre dentro de una transacción que se revierte.
--
-- Cómo correrlos:  supabase db query --linked -f supabase/tests/rls.sql
-- Devuelve una fila por prueba. Si alguna tiene ok = false, hay un agujero: no desplegar.
-- Solo se atrapa insufficient_privilege (42501, incluye "viola la policy de RLS"): cualquier otro error
-- (columna inexistente, etc.) corta el script a propósito, para que un test roto no pase por bueno.
--
-- Simula tres perfiles contra la base real: anon (sin sesión), un empleado temporal (se crea y se
-- revierte) y el administrador existente. Correrlos después de cada migración que toque policies o permisos.
begin;

create temp table resultados (prueba text, ok boolean, detalle text);

-- Empleado temporal (se revierte al final).
insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'empleado-test@invalid.local');
insert into public.perfiles (id, nombre, rol)
values ('00000000-0000-0000-0000-0000000000e1', 'Empleado Test', 'empleado');

-- 1) anon no puede leer ninguna tabla de public (ni por permisos ni por RLS).
do $$
declare
  t text; n bigint; fallos text := '';
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  for t in select tablename from pg_tables where schemaname = 'public' loop
    begin
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then fallos := fallos || t || ' '; end if;
    exception when insufficient_privilege then null;
    end;
  end loop;
  reset role;
  insert into resultados values ('anon no lee ninguna tabla', fallos = '', nullif(fallos, ''));
end $$;

-- 2) anon no puede ejecutar consumir_cupo ni crear perfiles.
do $$
declare ok1 boolean := false; ok2 boolean := false;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin perform public.consumir_cupo('x', 1, 1);
  exception when insufficient_privilege then ok1 := true; end;
  begin insert into public.perfiles (id, nombre, rol) values (gen_random_uuid(), 'x', 'administrador');
  exception when insufficient_privilege then ok2 := true; end;
  reset role;
  insert into resultados values ('anon no ejecuta consumir_cupo', ok1, null),
                                ('anon no inserta perfiles', ok2, null);
end $$;

-- 3) Usuario con sesión pero sin perfil: no ve gastos, no se crea perfil admin, no escribe nada sensible.
do $$
declare n bigint; ok2 boolean := false; ok3 boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000f1"}', true);
  set local role authenticated;
  select count(*) into n from public.gastos;
  begin insert into public.perfiles (id, nombre, rol)
        values ('00000000-0000-0000-0000-0000000000f1', 'intruso', 'administrador');
  exception when insufficient_privilege then ok2 := true; end;
  begin insert into public.productos (nombre, unidad_compra, unidad_stock) values ('x', 'u', 'u');
  exception when insufficient_privilege then ok3 := true; end;
  reset role;
  insert into resultados values ('sin perfil: no ve gastos', n = 0, n::text),
                                ('sin perfil: no se crea perfil admin', ok2, null),
                                ('sin perfil: no inserta productos', ok3, null);
end $$;

-- 4) Empleado: lo que puede y lo que no.
do $$
declare
  n bigint; filas int; r_gastos boolean := false; r_prod boolean := false; r_rol boolean := false;
  r_perfil boolean := false; r_lim boolean := false; c1 boolean; c2 boolean;
begin
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000e1"}', true);
  set local role authenticated;

  select count(*) into n from public.gastos;
  begin insert into public.gastos (fecha, categoria, concepto, monto) values (current_date, 'x', 'x', 1);
  exception when insufficient_privilege then r_gastos := true; end;
  begin insert into public.productos (nombre, unidad_compra, unidad_stock) values ('x', 'u', 'u');
  exception when insufficient_privilege then r_prod := true; end;
  begin update public.perfiles set rol = 'administrador' where id = '00000000-0000-0000-0000-0000000000e1';
  exception when insufficient_privilege then r_rol := true; end;
  begin insert into public.perfiles (id, nombre, rol)
        values ('00000000-0000-0000-0000-0000000000e2', 'x', 'administrador');
  exception when insufficient_privilege then r_perfil := true; end;
  begin perform 1 from public.limites_uso limit 1;
  exception when insufficient_privilege then r_lim := true; end;
  c1 := public.consumir_cupo('test-rls', 1, 60);
  c2 := public.consumir_cupo('test-rls', 1, 60);
  delete from public.proveedores;
  get diagnostics filas = row_count;

  reset role;
  insert into resultados values
    ('empleado: no ve gastos', n = 0, n::text),
    ('empleado: no inserta gastos', r_gastos, null),
    ('empleado: no inserta productos', r_prod, null),
    ('empleado: no puede cambiarse el rol', r_rol, null),
    ('empleado: no crea perfiles', r_perfil, null),
    ('empleado: no lee limites_uso directo', r_lim, null),
    ('empleado: consumir_cupo deja pasar la primera', c1 is true, null),
    ('empleado: consumir_cupo bloquea al pasarse', c2 is false, null),
    ('empleado: no borra proveedores', filas = 0, filas::text);
end $$;

-- 5) Administrador existente: lee gastos, pero no puede cambiarse el rol por UPDATE directo.
do $$
declare
  admin_id uuid; n bigint; ok boolean := false;
begin
  select id into admin_id from public.perfiles where rol = 'administrador' limit 1;
  perform set_config('request.jwt.claims',
    format('{"role":"authenticated","sub":"%s"}', admin_id), true);
  set local role authenticated;
  select count(*) into n from public.gastos;
  begin update public.perfiles set rol = 'empleado' where id = admin_id;
  exception when insufficient_privilege then ok := true; end;
  reset role;
  insert into resultados values ('admin: lee gastos sin error', true, n::text),
                                ('admin: no puede cambiarse el rol por UPDATE', ok, null);
end $$;

-- 5b) WhatsApp: permisos por rol y comportamiento de las funciones.
insert into public.whatsapp_conversaciones (id, telefono, clave)
values ('00000000-0000-0000-0000-0000000000c1', '5491100000001', '00000001');
insert into public.whatsapp_mensajes (conversacion_id, direccion, texto, origen)
values ('00000000-0000-0000-0000-0000000000c1', 'entrante', 'hola', 'entrante');

do $$
declare
  n_conv bigint; n_reglas bigint; filas int;
  ok_ins boolean := false; ok_texto boolean := false; ok_tel boolean := false; ok_fn boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000e1"}', true);
  set local role authenticated;
  select count(*) into n_conv from public.whatsapp_conversaciones;
  select count(*) into n_reglas from public.whatsapp_reglas;
  begin insert into public.whatsapp_mensajes (conversacion_id, direccion, texto, origen)
        values ('00000000-0000-0000-0000-0000000000c1', 'saliente', 'x', 'manual');
  exception when insufficient_privilege then ok_ins := true; end;
  begin update public.whatsapp_mensajes set texto = 'cambiado';
  exception when insufficient_privilege then ok_texto := true; end;
  begin update public.whatsapp_conversaciones set telefono = '5491100000009';
  exception when insufficient_privilege then ok_tel := true; end;
  update public.whatsapp_conversaciones set no_leidos = 0
   where id = '00000000-0000-0000-0000-0000000000c1';
  get diagnostics filas = row_count;
  begin perform public.whatsapp_registrar_mensaje('5491100000002', '00000002', null, 'entrante',
          'x', 'entrante', 'enviado', 'wa-x', null, null, null);
  exception when insufficient_privilege then ok_fn := true; end;
  reset role;
  insert into resultados values
    ('empleado: lee las conversaciones de WhatsApp', n_conv >= 1, n_conv::text),
    ('empleado: no ve las reglas automáticas', n_reglas = 0, n_reglas::text),
    ('empleado: no inserta mensajes de WhatsApp', ok_ins, null),
    ('empleado: no edita el texto de un mensaje', ok_texto, null),
    ('empleado: no cambia el teléfono de un chat', ok_tel, null),
    ('empleado: sí marca un chat como leído', filas = 1, filas::text),
    ('empleado: no ejecuta whatsapp_registrar_mensaje', ok_fn, null);
end $$;

do $$
declare admin_id uuid; n bigint; n_sin_perfil bigint;
begin
  select id into admin_id from public.perfiles where rol = 'administrador' limit 1;
  perform set_config('request.jwt.claims',
    format('{"role":"authenticated","sub":"%s"}', admin_id), true);
  set local role authenticated;
  select count(*) into n from public.whatsapp_reglas;
  reset role;
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000f1"}', true);
  set local role authenticated;
  select count(*) into n_sin_perfil from public.whatsapp_conversaciones;
  reset role;
  insert into resultados values
    ('admin: lee las reglas automáticas', n = 2, n::text),
    ('sin perfil: no lee conversaciones de WhatsApp', n_sin_perfil = 0, n_sin_perfil::text);
end $$;

do $$
declare prov uuid; r1 record; r2 record; vinculada uuid;
begin
  -- Sin usuario simulado: el registro de cambios de proveedores toma auth.uid() y no debe apuntar a un usuario inexistente.
  perform set_config('request.jwt.claims', '', true);
  insert into public.proveedores (nombre, telefono)
  values ('Proveedor WhatsApp Test', '(011) 15 9988-7766') returning id into prov;
  select * into r1 from public.whatsapp_registrar_mensaje('5491199887766', '99887766', 'Contacto',
    'entrante', 'hola', 'entrante', 'enviado', 'wa-test-1', null, null, null);
  select * into r2 from public.whatsapp_registrar_mensaje('5491199887766', '99887766', 'Contacto',
    'entrante', 'hola', 'entrante', 'enviado', 'wa-test-1', null, null, null);
  select proveedor_id into vinculada from public.whatsapp_conversaciones where id = r1.conversacion_id;
  insert into resultados values
    ('WhatsApp: un mensaje nuevo se guarda y abre la conversación', r1.es_nuevo and r1.primera_vez, null),
    ('WhatsApp: un aviso repetido no duplica el mensaje', not r2.es_nuevo, null),
    ('WhatsApp: vincula por los últimos 8 dígitos', vinculada = prov, null);
end $$;

-- 6) Estructura: toda tabla de public tiene RLS.
insert into resultados
select 'todas las tablas tienen RLS', count(*) = 0, string_agg(tablename, ', ')
from pg_tables where schemaname = 'public' and not rowsecurity;

select prueba, ok, detalle from resultados order by ok, prueba;

rollback;
