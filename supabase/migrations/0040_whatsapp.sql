-- 0040: chat de WhatsApp (conversaciones, mensajes y respuestas automáticas).
--
-- Los mensajes los escribe solo el servidor con la service_role (webhook del gateway y /api/whatsapp/enviar).
-- Los usuarios con sesión leen, marcan como leído y vinculan chats; los administradores además editan las reglas.
begin;

-- 1. Tablas ----------------------------------------------------------------------------------------
create table public.whatsapp_conversaciones (
  id uuid primary key default gen_random_uuid(),
  telefono text not null unique check (telefono ~ '^[0-9]{8,15}$'),
  clave text not null check (clave ~ '^[0-9]{8}$'),
  nombre_whatsapp text check (nombre_whatsapp is null or char_length(nombre_whatsapp) <= 120),
  proveedor_id uuid references public.proveedores (id) on delete set null,
  cliente_id uuid references public.clientes (id) on delete set null,
  ultimo_mensaje_en timestamptz not null default now(),
  ultimo_texto text,
  no_leidos integer not null default 0 check (no_leidos >= 0),
  creado_en timestamptz not null default now(),
  constraint whatsapp_un_solo_vinculo check (proveedor_id is null or cliente_id is null)
);
create index whatsapp_conversaciones_orden_idx on public.whatsapp_conversaciones (ultimo_mensaje_en desc);
create index whatsapp_conversaciones_clave_idx on public.whatsapp_conversaciones (clave);

create table public.whatsapp_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.whatsapp_conversaciones (id) on delete cascade,
  direccion text not null check (direccion in ('entrante', 'saliente')),
  texto text not null check (char_length(texto) between 1 and 4096),
  estado text not null default 'enviado'
    check (estado in ('pendiente', 'enviado', 'entregado', 'leido', 'error')),
  origen text not null default 'manual' check (origen in ('entrante', 'manual', 'pedido', 'automatico')),
  enviado_por uuid references auth.users (id) on delete set null,
  wa_message_id text unique,
  regla_tipo text check (regla_tipo is null or regla_tipo in ('saludo_inicial', 'fuera_de_horario')),
  creado_en timestamptz not null default now()
);
create index whatsapp_mensajes_conversacion_idx on public.whatsapp_mensajes (conversacion_id, creado_en desc);

create table public.whatsapp_reglas (
  tipo text primary key check (tipo in ('saludo_inicial', 'fuera_de_horario')),
  activa boolean not null default false,
  texto text not null check (char_length(texto) between 1 and 1000),
  abre time,
  cierra time,
  dias smallint[] not null default '{1,2,3,4,5,6}'
);

create table public.whatsapp_config (
  id boolean primary key default true check (id),
  automaticos_activos boolean not null default false
);

insert into public.whatsapp_reglas (tipo, activa, texto, abre, cierra) values
  ('saludo_inicial', false, 'Hola! Gracias por escribir a Planeta Animal. En breve te respondemos.', null, null),
  ('fuera_de_horario', false, 'Hola! Ahora estamos fuera de horario. Te respondemos apenas abramos.', '09:00', '19:00');
insert into public.whatsapp_config (id, automaticos_activos) values (true, false);

-- 2. Permisos y RLS --------------------------------------------------------------------------------
alter table public.whatsapp_conversaciones enable row level security;
alter table public.whatsapp_mensajes enable row level security;
alter table public.whatsapp_reglas enable row level security;
alter table public.whatsapp_config enable row level security;

revoke all on public.whatsapp_conversaciones, public.whatsapp_mensajes,
              public.whatsapp_reglas, public.whatsapp_config from anon, authenticated;

grant select on public.whatsapp_conversaciones to authenticated;
grant update (no_leidos, proveedor_id, cliente_id) on public.whatsapp_conversaciones to authenticated;
grant select on public.whatsapp_mensajes to authenticated;
grant select, update (activa, texto, abre, cierra, dias) on public.whatsapp_reglas to authenticated;
grant select, update (automaticos_activos) on public.whatsapp_config to authenticated;

create policy "whatsapp_conversaciones_leer" on public.whatsapp_conversaciones
  for select to authenticated
  using (exists (select 1 from public.perfiles where id = auth.uid()));
create policy "whatsapp_conversaciones_actualizar" on public.whatsapp_conversaciones
  for update to authenticated
  using (exists (select 1 from public.perfiles where id = auth.uid()))
  with check (exists (select 1 from public.perfiles where id = auth.uid()));

create policy "whatsapp_mensajes_leer" on public.whatsapp_mensajes
  for select to authenticated
  using (exists (select 1 from public.perfiles where id = auth.uid()));

create policy "whatsapp_reglas_solo_admin" on public.whatsapp_reglas
  for all to authenticated
  using (exists (select 1 from public.perfiles where id = auth.uid() and rol = 'administrador'))
  with check (exists (select 1 from public.perfiles where id = auth.uid() and rol = 'administrador'));
create policy "whatsapp_config_solo_admin" on public.whatsapp_config
  for all to authenticated
  using (exists (select 1 from public.perfiles where id = auth.uid() and rol = 'administrador'))
  with check (exists (select 1 from public.perfiles where id = auth.uid() and rol = 'administrador'));

-- 3. Realtime (respeta las policies de lectura de arriba) ---------------------------------------------
alter publication supabase_realtime add table public.whatsapp_conversaciones, public.whatsapp_mensajes;

-- 4. Funciones (solo service_role) -----------------------------------------------------------------
-- Busca un proveedor o cliente por los últimos 8 dígitos del teléfono. Solo devuelve algo si hay
-- exactamente una coincidencia entre proveedores y clientes; si hay duda, el chat queda sin vincular.
create or replace function public.whatsapp_buscar_vinculo(p_clave text)
returns table (proveedor_id uuid, cliente_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_prov uuid[];
  v_cli uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_prov from public.proveedores
   where telefono is not null and right(regexp_replace(telefono, '\D', '', 'g'), 8) = p_clave;
  select coalesce(array_agg(id), '{}') into v_cli from public.clientes
   where telefono is not null and right(regexp_replace(telefono, '\D', '', 'g'), 8) = p_clave;
  if cardinality(v_prov) + cardinality(v_cli) = 1 then
    return query select v_prov[1], v_cli[1];
  end if;
end
$$;

-- Guarda un mensaje (entrante o saliente), creando la conversación si hace falta. Es idempotente por
-- wa_message_id: si el gateway repite el aviso, o llega el eco de un mensaje que ya mandó el sistema,
-- no duplica y completa quién lo envió y de qué origen era.
create or replace function public.whatsapp_registrar_mensaje(
  p_telefono text,
  p_clave text,
  p_nombre text,
  p_direccion text,
  p_texto text,
  p_origen text,
  p_estado text,
  p_wa_message_id text,
  p_enviado_por uuid,
  p_regla_tipo text,
  p_proveedor_id uuid
)
returns table (
  conversacion_id uuid,
  mensaje_id uuid,
  es_nuevo boolean,
  primera_vez boolean,
  vinculo_proveedor_id uuid,
  vinculo_cliente_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_conv uuid;
  v_creada boolean;
  v_msg uuid;
  v_nuevo boolean;
begin
  insert into public.whatsapp_conversaciones as c (telefono, clave, nombre_whatsapp)
  values (
    p_telefono, p_clave,
    case when p_direccion = 'entrante' then nullif(left(btrim(coalesce(p_nombre, '')), 120), '') end
  )
  on conflict (telefono) do update
    set nombre_whatsapp = coalesce(excluded.nombre_whatsapp, c.nombre_whatsapp)
  returning c.id, (c.xmax = 0) into v_conv, v_creada;

  if v_creada then
    if p_proveedor_id is not null then
      update public.whatsapp_conversaciones set proveedor_id = p_proveedor_id where id = v_conv;
    else
      update public.whatsapp_conversaciones c
         set proveedor_id = v.proveedor_id, cliente_id = v.cliente_id
        from public.whatsapp_buscar_vinculo(p_clave) v
       where c.id = v_conv;
    end if;
  elsif p_proveedor_id is not null then
    update public.whatsapp_conversaciones
       set proveedor_id = p_proveedor_id, cliente_id = null
     where id = v_conv and proveedor_id is null and cliente_id is null;
  end if;

  insert into public.whatsapp_mensajes as m
    (conversacion_id, direccion, texto, estado, origen, enviado_por, wa_message_id, regla_tipo)
  values
    (v_conv, p_direccion, p_texto, p_estado, p_origen, p_enviado_por, p_wa_message_id, p_regla_tipo)
  on conflict (wa_message_id) do update
    set enviado_por = coalesce(m.enviado_por, excluded.enviado_por),
        origen = case when excluded.origen in ('pedido', 'automatico') then excluded.origen else m.origen end,
        regla_tipo = coalesce(m.regla_tipo, excluded.regla_tipo)
  returning m.id, (m.xmax = 0) into v_msg, v_nuevo;

  if v_nuevo then
    update public.whatsapp_conversaciones
       set ultimo_mensaje_en = now(),
           ultimo_texto = left(p_texto, 200),
           no_leidos = no_leidos + case when p_direccion = 'entrante' then 1 else 0 end
     where id = v_conv;
  end if;

  return query
    select v_conv, v_msg, v_nuevo, (v_creada and p_direccion = 'entrante'), c.proveedor_id, c.cliente_id
      from public.whatsapp_conversaciones c
     where c.id = v_conv;
end
$$;

revoke all on function public.whatsapp_buscar_vinculo(text) from public, anon, authenticated;
revoke all on function public.whatsapp_registrar_mensaje(text, text, text, text, text, text, text, text, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.whatsapp_buscar_vinculo(text) to service_role;
grant execute on function public.whatsapp_registrar_mensaje(text, text, text, text, text, text, text, text, uuid, text, uuid)
  to service_role;

commit;
