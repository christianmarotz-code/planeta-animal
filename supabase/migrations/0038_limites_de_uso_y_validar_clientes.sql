-- 0038: endurecimiento de seguridad (auditoría 2026-10-31). Sin cambios de comportamiento para el uso normal.
--
-- 1) Límite de uso por usuario y endpoint (rate limiting en la base, sirve en serverless).
--    Lo usan /api/comparador/leer-pdf y /api/boletas/extraer vía lib/auth/limitarUso.ts.
-- 2) clientes: el alta sigue abierta a cualquier usuario logueado (flujo de /ventas/nueva),
--    pero ahora con tope de largo en los campos. NOT VALID: solo valida filas nuevas o editadas,
--    no rompe datos que ya estén cargados.
begin;

-- 1. Límite de uso -----------------------------------------------------------------------------
create table public.limites_uso (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  creado_en timestamptz not null default now()
);

create index limites_uso_usuario_endpoint_idx
  on public.limites_uso (usuario_id, endpoint, creado_en desc);

-- RLS activado y sin policies: solo se toca a través de consumir_cupo().
alter table public.limites_uso enable row level security;
revoke all on public.limites_uso from anon, authenticated;

-- Registra una llamada del usuario logueado. Devuelve false si ya superó `p_max` llamadas
-- al endpoint dentro de los últimos `p_ventana_segundos` (y en ese caso no registra nada).
create or replace function public.consumir_cupo(
  p_endpoint text,
  p_max integer,
  p_ventana_segundos integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_usadas integer;
begin
  if v_usuario is null then
    return false;
  end if;
  if p_endpoint is null or char_length(p_endpoint) not between 1 and 100
     or p_max not between 1 and 10000
     or p_ventana_segundos not between 1 and 86400 then
    raise exception 'Parámetros de límite inválidos';
  end if;

  -- Limpieza barata: solo las filas de este usuario con más de un día.
  delete from public.limites_uso
  where usuario_id = v_usuario and creado_en < now() - interval '1 day';

  select count(*) into v_usadas
  from public.limites_uso
  where usuario_id = v_usuario
    and endpoint = p_endpoint
    and creado_en > now() - make_interval(secs => p_ventana_segundos);

  if v_usadas >= p_max then
    return false;
  end if;

  insert into public.limites_uso (usuario_id, endpoint) values (v_usuario, p_endpoint);
  return true;
end
$$;

revoke all on function public.consumir_cupo(text, integer, integer) from public, anon;
grant execute on function public.consumir_cupo(text, integer, integer) to authenticated;

-- 2. clientes: topes de largo ---------------------------------------------------------------------
alter table public.clientes
  add constraint clientes_nombre_largo check (char_length(btrim(nombre)) between 1 and 120) not valid,
  add constraint clientes_telefono_largo check (telefono is null or char_length(telefono) <= 40) not valid,
  add constraint clientes_email_largo check (email is null or char_length(email) <= 254) not valid;

commit;
