# Chat de WhatsApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una sección `/whatsapp` donde el equipo habla con clientes y proveedores usando el número del negocio vinculado por QR, con pedidos desde Reposición y respuestas automáticas.

**Architecture:** Un gateway Evolution API (servidor chico, siempre prendido) mantiene la sesión del QR. Le avisa a Next.js por webhook; el sistema guarda todo en Supabase con la clave de servicio y la pantalla lo muestra en tiempo real con Supabase Realtime. Todo lo que depende del formato del gateway queda aislado en `lib/whatsapp/entrante.ts` y `lib/whatsapp/gateway.ts`.

**Tech Stack:** Next.js 16.4.2 (App Router, `proxy.ts`), React 19, Supabase (Postgres + RLS + Realtime), vitest, Playwright, Evolution API v2.

**Spec:** `docs/superpowers/specs/2026-11-03-whatsapp-chat-design.md`

## Global Constraints

- Texto de la interfaz y mensajes de error en español rioplatense (voseo: "Intentá", "Revisá").
- A los clientes del navegador solo les llegan errores genéricos; el detalle va a `console.error` del servidor (patrón `errorInterno` de `app/api/usuarios/route.ts`).
- La clave de servicio (`createAdminClient`) y la clave del gateway nunca se importan desde un componente `'use client'`.
- Toda tabla nueva lleva RLS activado y `revoke all ... from anon, authenticated` en la misma migración; los permisos se otorgan de vuelta de forma explícita.
- Las rutas dinámicas de Next 16 reciben `params` como `Promise` (`await ctx.params`).
- Solo texto en la v1: adjuntos se muestran como "📷 Imagen", "🎤 Audio", etc.
- Mensajes automáticos: solo a quien escribió primero, una vez por conversación cada 24 h por regla, pausa de 2 a 6 s, nunca a proveedores, interruptor general apagado por defecto.
- Las migraciones las pega el usuario en el SQL Editor de Supabase; el acceso de Claude a Supabase es de solo lectura. Después de pegar, verificar con un `select`.
- Commits en español con el prefijo `feat:` / `fix:` / `docs:`. Antes de cada commit: `npm run typecheck && npm run lint && npm test`. `npm run check` (incluye `knip`, que marca exports sin uso) se corre al cerrar las Tasks 9, 11, 12 y 13; en las anteriores un export aún sin consumidor es esperable.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0040_whatsapp.sql` | Tablas, RLS, funciones, Realtime, reglas iniciales |
| `supabase/tests/rls.sql` | Pruebas de permisos y de las funciones nuevas |
| `types/supabase.ts` | Regenerado desde la base |
| `types/database.ts` | Interfaces de las tablas nuevas |
| `lib/whatsapp/telefono.ts` | Normaliza teléfonos y arma el número de envío |
| `lib/whatsapp/entrante.ts` | Traduce el cuerpo del webhook a un evento propio |
| `lib/whatsapp/gateway.ts` | Cliente HTTP del gateway (enviar, estado, QR) |
| `lib/whatsapp/registro.ts` | Llama a `whatsapp_registrar_mensaje` |
| `lib/whatsapp/webhook.ts` | Valida el secreto y procesa un evento |
| `lib/whatsapp/envio.ts` | Valida y ejecuta un envío (nuevo, pedido, reintento) |
| `lib/whatsapp/automaticos.ts` | Reglas de respuesta automática (puras) y orquestador |
| `lib/whatsapp/automaticosServidor.ts` | Conecta el orquestador con Supabase y el gateway |
| `lib/whatsapp/pedido.ts` | Arma el texto del pedido a proveedor |
| `lib/whatsapp/presentacion.ts` | Nombre y etiqueta de vínculo para mostrar |
| `lib/data/whatsapp.ts` | Lecturas y escrituras desde el navegador + Realtime |
| `app/api/whatsapp/webhook/[secreto]/route.ts` | Recibe los avisos del gateway |
| `app/api/whatsapp/enviar/route.ts` | Envía mensajes |
| `app/api/whatsapp/conexion/route.ts` | Estado de la conexión y QR |
| `app/(app)/whatsapp/*` | Bandeja, conexión, respuestas automáticas |
| `app/(app)/reposicion/*` | Botón y ventana de pedido por WhatsApp |
| `proxy.ts` | Deja pasar el webhook sin sesión |
| `docs/WHATSAPP.md` | Despliegue y operación del gateway |

---

### Task 1: Gateway de prueba y payloads reales

Esta tarea es una verificación, no código de producción. Los nombres de campos de Evolution API no se pudieron confirmar en su documentación (las páginas v2 dieron 404 y las fuentes secundarias se contradicen), así que se verifican contra una instancia real antes de escribir el parser. **Necesita al usuario**: instalar Docker y escanear el QR con su celular.

**Files:**
- Create: `scratch/whatsapp-gateway/escuchar.mjs` (no se commitea; `scratch/` ya está sin seguimiento)
- Create: `docs/WHATSAPP.md`

**Interfaces:**
- Produces: la sección "Verificado" de `docs/WHATSAPP.md` con (a) versión de la imagen usada, (b) ruta y cuerpo reales para enviar texto, consultar estado y pedir el QR, (c) un cuerpo real de webhook por cada tipo: texto, imagen, mensaje propio, grupo. Las Tasks 4 y 5 ajustan sus constantes a eso.

- [ ] **Step 1: Instalar Docker Desktop** (hoy no está instalado)

Run: `brew install --cask docker` y abrir Docker Desktop una vez.
Expected: `docker --version` imprime una versión.

- [ ] **Step 2: Levantar Evolution API**

Abrir el README oficial `https://github.com/EvolutionAPI/evolution-api`, copiar su `docker-compose.yaml` actual (Evolution v2 más Postgres y Redis) a `scratch/whatsapp-gateway/docker-compose.yaml`, y definir `AUTHENTICATION_API_KEY` con un valor largo propio.

Run: `cd scratch/whatsapp-gateway && docker compose up -d`
Expected: el contenedor de Evolution queda `running`; `http://localhost:8080` responde.

- [ ] **Step 3: Escuchador de webhooks**

```js
// scratch/whatsapp-gateway/escuchar.mjs
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('payloads', { recursive: true })
let n = 0
createServer((req, res) => {
  let cuerpo = ''
  req.on('data', (c) => (cuerpo += c))
  req.on('end', () => {
    const archivo = `payloads/${String(++n).padStart(3, '0')}.json`
    writeFileSync(archivo, JSON.stringify({ url: req.url, headers: req.headers, body: JSON.parse(cuerpo || '{}') }, null, 2))
    console.log('guardado', archivo)
    res.end('ok')
  })
}).listen(4000, () => console.log('escuchando en :4000'))
```

Run: `node scratch/whatsapp-gateway/escuchar.mjs` (dejarlo corriendo).

- [ ] **Step 4: Crear la instancia, vincular el celular y apuntar el webhook**

Abrir `http://localhost:8080/manager`, crear la instancia `planeta`, escanear el QR con el celular, y configurar el webhook en `http://host.docker.internal:4000/` con el evento `MESSAGES_UPSERT` (sin "webhook by events", sin base64). Anotar qué ruta usa el Manager para configurarlo.

Expected: el estado de la instancia pasa a `open`.

- [ ] **Step 5: Generar los payloads**

Desde otro teléfono, escribir al número vinculado: un texto, una foto, un audio. Desde el celular vinculado, responder un texto. Si hay un grupo disponible, escribir en el grupo.

Expected: `scratch/whatsapp-gateway/payloads/` tiene un archivo por mensaje.

- [ ] **Step 6: Verificar las llamadas al gateway con curl**

```bash
curl -s -X POST http://localhost:8080/message/sendText/planeta -H "apikey: $CLAVE" -H "Content-Type: application/json" -d '{"number":"549XXXXXXXXXX","text":"prueba"}'
curl -s http://localhost:8080/instance/connectionState/planeta -H "apikey: $CLAVE"
curl -s http://localhost:8080/instance/connect/planeta -H "apikey: $CLAVE"
```
(`549XXXXXXXXXX` es el número propio o de alguien que sepa de la prueba; nunca mandar pruebas a terceros.)

- [ ] **Step 7: Registrar lo verificado**

Crear `docs/WHATSAPP.md` con la sección "Verificado contra Evolution API" y, para cada punto, el dato real:

```markdown
# WhatsApp: operación del gateway

## Verificado contra Evolution API

- Imagen/versión usada: (copiar del docker-compose)
- Enviar texto: método, ruta, cuerpo y dónde viene el id del mensaje en la respuesta
- Estado de conexión: ruta y dónde viene el estado (valores posibles)
- QR: ruta y dónde viene la imagen en base64
- Webhook: ruta/pantalla usada para configurarlo y nombre exacto del evento en el cuerpo (`event`)
- Mensaje de texto recibido: ruta de cada campo (`key.remoteJid`, `key.fromMe`, `key.id`, `pushName`, `message.conversation`)
- ¿`remoteJid` llega como `...@lid`? Si es así, ¿en qué campo viene el número real?
```

Si algo difiere de lo que usan las Tasks 4 y 5 (nombres del evento, `state`, ruta del QR), anotarlo aquí y ajustar esas constantes al implementarlas.

- [ ] **Step 8: Commit**

```bash
git add docs/WHATSAPP.md
git commit -m "docs: verificación del gateway de WhatsApp contra una instancia real"
```

---

### Task 2: Migración 0040, pruebas de RLS y tipos

**Files:**
- Create: `supabase/migrations/0040_whatsapp.sql`
- Modify: `supabase/tests/rls.sql` (agregar un bloque antes de `-- 6) Estructura`)
- Modify: `types/supabase.ts` (regenerado)
- Modify: `types/database.ts`

**Interfaces:**
- Produces (SQL): tablas `whatsapp_conversaciones`, `whatsapp_mensajes`, `whatsapp_reglas`, `whatsapp_config`; función `whatsapp_buscar_vinculo(p_clave text)`; función `whatsapp_registrar_mensaje(p_telefono text, p_clave text, p_nombre text, p_direccion text, p_texto text, p_origen text, p_estado text, p_wa_message_id text, p_enviado_por uuid, p_regla_tipo text, p_proveedor_id uuid)` que devuelve `conversacion_id, mensaje_id, es_nuevo, primera_vez, vinculo_proveedor_id, vinculo_cliente_id`.
- Produces (TS): `Conversacion`, `Mensaje`, `ReglaWhatsapp`, `ConfigWhatsapp`, `DireccionMensaje`, `EstadoMensajeWhatsapp`, `OrigenMensajeWhatsapp`, `TipoReglaWhatsapp` en `types/database.ts`.

- [ ] **Step 1: Escribir la migración**

```sql
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
```

- [ ] **Step 2: Agregar las pruebas de RLS**

En `supabase/tests/rls.sql`, insertar este bloque justo antes del comentario `-- 6) Estructura: toda tabla de public tiene RLS.`:

```sql
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
```

- [ ] **Step 3: El usuario aplica la migración**

Pedirle al usuario que pegue `0040_whatsapp.sql` en el SQL Editor de Supabase y lo ejecute. Después verificar:

```bash
supabase db query --linked "select tipo, activa from public.whatsapp_reglas order by tipo"
```
Expected: dos filas, `fuera_de_horario` y `saludo_inicial`, ambas `activa = false`.

- [ ] **Step 4: Correr las pruebas de RLS**

Run: `supabase db query --linked -f supabase/tests/rls.sql`
Expected: todas las filas con `ok = true`, incluidas las nuevas. Si alguna falla, corregir la migración y volver a pegarla (la transacción de la prueba no deja rastro).

- [ ] **Step 5: Regenerar los tipos de la base**

```bash
head -3 types/supabase.ts > /tmp/encabezado-supabase.txt
npx supabase gen types typescript --linked --schema public > types/supabase.ts
cat /tmp/encabezado-supabase.txt types/supabase.ts > /tmp/supabase-nuevo.ts && mv /tmp/supabase-nuevo.ts types/supabase.ts
```
Expected: `types/supabase.ts` conserva el comentario de las 3 primeras líneas y ahora incluye `whatsapp_conversaciones`, `whatsapp_mensajes`, `whatsapp_reglas`, `whatsapp_config` y las dos funciones nuevas.

- [ ] **Step 6: Tipos de la app**

En `types/database.ts`, agregar antes de `type TablasBase` (después de `ItemVenta`):

```ts
export type DireccionMensaje = 'entrante' | 'saliente'
export type EstadoMensajeWhatsapp = 'pendiente' | 'enviado' | 'entregado' | 'leido' | 'error'
export type OrigenMensajeWhatsapp = 'entrante' | 'manual' | 'pedido' | 'automatico'
export type TipoReglaWhatsapp = 'saludo_inicial' | 'fuera_de_horario'

export interface Conversacion {
  id: string
  telefono: string
  clave: string
  nombre_whatsapp: string | null
  proveedor_id: string | null
  cliente_id: string | null
  ultimo_mensaje_en: string
  ultimo_texto: string | null
  no_leidos: number
  creado_en: string
}

export interface Mensaje {
  id: string
  conversacion_id: string
  direccion: DireccionMensaje
  texto: string
  estado: EstadoMensajeWhatsapp
  origen: OrigenMensajeWhatsapp
  enviado_por: string | null
  wa_message_id: string | null
  regla_tipo: TipoReglaWhatsapp | null
  creado_en: string
}

export interface ReglaWhatsapp {
  tipo: TipoReglaWhatsapp
  activa: boolean
  texto: string
  abre: string | null
  cierra: string | null
  dias: number[]
}

export interface ConfigWhatsapp {
  id: boolean
  automaticos_activos: boolean
}
```

Y dentro de `Database.public.Tables`, después de `items_venta`:

```ts
      whatsapp_conversaciones: Tabla<'whatsapp_conversaciones', Conversacion>
      whatsapp_mensajes: Tabla<'whatsapp_mensajes', Mensaje>
      whatsapp_reglas: Tabla<'whatsapp_reglas', ReglaWhatsapp>
      whatsapp_config: Tabla<'whatsapp_config', ConfigWhatsapp>
```

- [ ] **Step 7: Verificar tipos**

Run: `npm run typecheck`
Expected: sin errores. Si el verificador de columnas de `Tabla<>` marca "Faltan/Sobran columnas", corregir la interfaz para que coincida exactamente con el tipo generado.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0040_whatsapp.sql supabase/tests/rls.sql types/supabase.ts types/database.ts
git commit -m "feat: tablas, permisos y funciones de WhatsApp (migración 0040)"
```

---

### Task 3: Teléfonos

**Files:**
- Create: `lib/whatsapp/telefono.ts`
- Test: `lib/whatsapp/telefono.test.ts`

**Interfaces:**
- Produces: `normalizarTelefono(crudo: string): { digitos: string; clave: string } | null` y `numeroParaEnviar(crudo: string): string | null`.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
// lib/whatsapp/telefono.test.ts
import { describe, it, expect } from 'vitest'
import { normalizarTelefono, numeroParaEnviar } from './telefono'

describe('normalizarTelefono', () => {
  it('toma los dígitos de un JID y la clave de 8 dígitos', () => {
    expect(normalizarTelefono('5491112345678@s.whatsapp.net')).toEqual({
      digitos: '5491112345678',
      clave: '12345678',
    })
  })
  it('ignora el sufijo de dispositivo', () => {
    expect(normalizarTelefono('5491112345678:12@s.whatsapp.net')?.digitos).toBe('5491112345678')
  })
  it('rechaza lo que no parece un teléfono', () => {
    expect(normalizarTelefono('123')).toBeNull()
    expect(normalizarTelefono('status@broadcast')).toBeNull()
    expect(normalizarTelefono('1234567890123456')).toBeNull()
  })
})

describe('numeroParaEnviar', () => {
  it.each([
    ['+54 9 11 1234-5678', '5491112345678'],
    ['54 11 1234 5678', '5491112345678'],
    ['011 15 4444-5555', '5491144445555'],
    ['(0221) 15 555-1234', '5492215551234'],
    ['11 4444-5555', '5491144445555'],
  ])('convierte %s', (entrada, esperado) => {
    expect(numeroParaEnviar(entrada)).toBe(esperado)
  })
  it('devuelve null si no es un celular argentino reconocible', () => {
    expect(numeroParaEnviar('abc')).toBeNull()
    expect(numeroParaEnviar('')).toBeNull()
    expect(numeroParaEnviar('+1 415 555 2671')).toBeNull()
    expect(numeroParaEnviar('4444-5555')).toBeNull()
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run lib/whatsapp/telefono.test.ts`
Expected: FAIL, "Failed to resolve import './telefono'".

- [ ] **Step 3: Implementar**

```ts
// lib/whatsapp/telefono.ts
export interface TelefonoNormalizado {
  /** Solo dígitos, con código de país: 5491112345678 */
  digitos: string
  /** Últimos 8 dígitos: sirve para vincular con teléfonos cargados a mano en cualquier formato. */
  clave: string
}

/** Normaliza el número de un JID de WhatsApp ("5491112345678:12@s.whatsapp.net"). */
export function normalizarTelefono(crudo: string): TelefonoNormalizado | null {
  const numero = crudo.split('@')[0].split(':')[0]
  const digitos = numero.replace(/\D/g, '')
  if (digitos.length < 8 || digitos.length > 15) return null
  return { digitos, clave: digitos.slice(-8) }
}

/**
 * Convierte un teléfono escrito a mano (como lo carga el equipo en proveedores) al formato que
 * usa WhatsApp para celulares argentinos: 549 + código de área + número. Devuelve null si no
 * se reconoce, para no mandar un pedido a un número equivocado.
 */
export function numeroParaEnviar(crudo: string): string | null {
  let d = crudo.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('54')) {
    if (!d.startsWith('549')) d = '549' + d.slice(2)
    return d.length === 13 ? d : null
  }
  d = d.replace(/^0/, '')
  if (d.length === 12) {
    // Formato local con "15" después del código de área (de 2 a 4 dígitos).
    for (const largoArea of [2, 3, 4]) {
      if (d.slice(largoArea, largoArea + 2) === '15') {
        return '549' + d.slice(0, largoArea) + d.slice(largoArea + 2)
      }
    }
    return null
  }
  return d.length === 10 ? '549' + d : null
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run lib/whatsapp/telefono.test.ts`
Expected: PASS, todas las pruebas.

- [ ] **Step 5: Commit**

```bash
git add lib/whatsapp/telefono.ts lib/whatsapp/telefono.test.ts
git commit -m "feat: normalización de teléfonos para WhatsApp"
```

---

### Task 4: Traducción de los avisos del gateway

> Ajustar los nombres de campo a lo registrado en `docs/WHATSAPP.md` (Task 1) si difieren.

**Files:**
- Create: `lib/whatsapp/entrante.ts`
- Test: `lib/whatsapp/entrante.test.ts`

**Interfaces:**
- Produces: `interpretarEvento(body: unknown): EventoWhatsapp` con
  `EventoWhatsapp = { tipo: 'mensaje'; waMessageId: string; jid: string; nombre: string | null; texto: string; propio: boolean } | { tipo: 'ignorado'; motivo: string }`.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
// lib/whatsapp/entrante.test.ts
import { describe, it, expect } from 'vitest'
import { interpretarEvento } from './entrante'

function aviso(data: Record<string, unknown>, event = 'messages.upsert') {
  return { event, instance: 'planeta', data }
}
const clave = { remoteJid: '5491112345678@s.whatsapp.net', fromMe: false, id: 'ABC123' }

describe('interpretarEvento', () => {
  it('lee un texto simple', () => {
    const r = interpretarEvento(
      aviso({ key: clave, pushName: 'Ana', messageType: 'conversation', message: { conversation: 'Hola!' } })
    )
    expect(r).toEqual({
      tipo: 'mensaje',
      waMessageId: 'ABC123',
      jid: '5491112345678@s.whatsapp.net',
      nombre: 'Ana',
      texto: 'Hola!',
      propio: false,
    })
  })

  it('lee un texto extendido y acepta el evento en mayúsculas', () => {
    const r = interpretarEvento(
      aviso(
        { key: clave, messageType: 'extendedTextMessage', message: { extendedTextMessage: { text: 'Con link' } } },
        'MESSAGES_UPSERT'
      )
    )
    expect(r).toMatchObject({ tipo: 'mensaje', texto: 'Con link' })
  })

  it('describe los adjuntos y conserva el epígrafe', () => {
    const imagen = interpretarEvento(
      aviso({ key: clave, messageType: 'imageMessage', message: { imageMessage: { caption: 'Mirá esto' } } })
    )
    expect(imagen).toMatchObject({ tipo: 'mensaje', texto: '📷 Imagen: Mirá esto' })
    const audio = interpretarEvento(aviso({ key: clave, messageType: 'audioMessage', message: { audioMessage: {} } }))
    expect(audio).toMatchObject({ tipo: 'mensaje', texto: '🎤 Audio' })
  })

  it('marca como propio lo que se escribió desde el celular y no toma su nombre', () => {
    const r = interpretarEvento(
      aviso({
        key: { ...clave, fromMe: true },
        pushName: 'Christian',
        message: { conversation: 'Ya te lo mando' },
      })
    )
    expect(r).toMatchObject({ tipo: 'mensaje', propio: true, nombre: null })
  })

  it('usa el número real cuando el JID llega como LID', () => {
    const r = interpretarEvento(
      aviso({
        key: { ...clave, remoteJid: '1234567890@lid', remoteJidAlt: '5491112345678@s.whatsapp.net' },
        message: { conversation: 'x' },
      })
    )
    expect(r).toMatchObject({ tipo: 'mensaje', jid: '5491112345678@s.whatsapp.net' })
  })

  it.each([
    ['grupo', aviso({ key: { ...clave, remoteJid: '1203@g.us' }, message: { conversation: 'x' } })],
    ['estado', aviso({ key: { ...clave, remoteJid: 'status@broadcast' }, message: { conversation: 'x' } })],
    ['reacción', aviso({ key: clave, messageType: 'reactionMessage', message: { reactionMessage: {} } })],
    ['otro evento', aviso({ key: clave, message: { conversation: 'x' } }, 'connection.update')],
    ['sin id', aviso({ key: { remoteJid: clave.remoteJid }, message: { conversation: 'x' } })],
  ])('ignora: %s', (_nombre, cuerpo) => {
    expect(interpretarEvento(cuerpo).tipo).toBe('ignorado')
  })

  it('ignora cuerpos inválidos', () => {
    expect(interpretarEvento(null).tipo).toBe('ignorado')
    expect(interpretarEvento('hola').tipo).toBe('ignorado')
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run lib/whatsapp/entrante.test.ts`
Expected: FAIL, "Failed to resolve import './entrante'".

- [ ] **Step 3: Implementar**

```ts
// lib/whatsapp/entrante.ts
// Único lugar que conoce la forma de los avisos (webhooks) del gateway.
export type EventoWhatsapp =
  | {
      tipo: 'mensaje'
      waMessageId: string
      jid: string
      nombre: string | null
      texto: string
      propio: boolean
    }
  | { tipo: 'ignorado'; motivo: string }

const TIPOS_IGNORADOS = new Set([
  'reactionMessage',
  'protocolMessage',
  'senderKeyDistributionMessage',
  'editedMessage',
])

const ADJUNTOS: Record<string, string> = {
  imageMessage: '📷 Imagen',
  audioMessage: '🎤 Audio',
  videoMessage: '🎥 Video',
  documentMessage: '📄 Documento',
  stickerMessage: '🙂 Sticker',
  contactMessage: '👤 Contacto',
  locationMessage: '📍 Ubicación',
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null
}

function cadena(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null
}

function ignorado(motivo: string): EventoWhatsapp {
  return { tipo: 'ignorado', motivo }
}

export function interpretarEvento(body: unknown): EventoWhatsapp {
  const raiz = objeto(body)
  if (!raiz) return ignorado('cuerpo inválido')

  const evento = (cadena(raiz.event) ?? '').toLowerCase().replace(/_/g, '.')
  if (evento !== 'messages.upsert') return ignorado(`evento ${evento || 'desconocido'}`)

  const data = objeto(raiz.data)
  const key = objeto(data?.key)
  const id = cadena(key?.id)
  let jid = cadena(key?.remoteJid)
  if (!data || !key || !id || !jid) return ignorado('mensaje sin clave')

  // WhatsApp a veces esconde el número detrás de un identificador interno (@lid).
  if (jid.endsWith('@lid')) jid = cadena(key.remoteJidAlt) ?? jid
  if (!jid.endsWith('@s.whatsapp.net')) return ignorado('no es un chat individual')

  const mensaje = objeto(data.message)
  if (!mensaje) return ignorado('sin contenido')

  const tipoMensaje = cadena(data.messageType) ?? Object.keys(mensaje)[0] ?? ''
  if (TIPOS_IGNORADOS.has(tipoMensaje)) return ignorado(`tipo ${tipoMensaje}`)

  const propio = key.fromMe === true
  const texto =
    cadena(mensaje.conversation) ??
    cadena(objeto(mensaje.extendedTextMessage)?.text) ??
    descripcionDeAdjunto(tipoMensaje, mensaje)

  return {
    tipo: 'mensaje',
    waMessageId: id,
    jid,
    nombre: propio ? null : cadena(data.pushName),
    texto,
    propio,
  }
}

function descripcionDeAdjunto(tipo: string, mensaje: Record<string, unknown>): string {
  const base = ADJUNTOS[tipo]
  if (!base) return '📎 Mensaje no compatible'
  const epigrafe = cadena(objeto(mensaje[tipo])?.caption)
  return epigrafe ? `${base}: ${epigrafe}` : base
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run lib/whatsapp/entrante.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/whatsapp/entrante.ts lib/whatsapp/entrante.test.ts
git commit -m "feat: traducción de los avisos del gateway de WhatsApp"
```

---

### Task 5: Cliente del gateway

> Ajustar rutas y campos a lo registrado en `docs/WHATSAPP.md` (Task 1) si difieren.

**Files:**
- Create: `lib/whatsapp/gateway.ts`
- Test: `lib/whatsapp/gateway.test.ts`
- Modify: `.env.local.example`

**Interfaces:**
- Produces: `ConfigGateway`, `EstadoConexion = 'abierta' | 'conectando' | 'cerrada' | 'desconocido'`, `leerConfigGateway(env?): ConfigGateway | null`, `enviarTexto(cfg, numero, texto, fetchFn?): Promise<{ waMessageId: string | null }>`, `consultarConexion(cfg, fetchFn?): Promise<EstadoConexion>`, `obtenerQr(cfg, fetchFn?): Promise<string | null>`, `ErrorGateway`.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
// lib/whatsapp/gateway.test.ts
import { describe, it, expect, vi } from 'vitest'
import { consultarConexion, enviarTexto, leerConfigGateway, obtenerQr, ErrorGateway } from './gateway'

const cfg = { url: 'https://gw.test', apiKey: 'clave', instancia: 'planeta' }

function respuesta(cuerpo: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({ ok, status, json: async () => cuerpo }) as unknown as typeof fetch
}

describe('leerConfigGateway', () => {
  it('devuelve null si falta algo', () => {
    expect(leerConfigGateway({ WHATSAPP_GATEWAY_URL: 'https://gw.test' })).toBeNull()
  })
  it('quita la barra final de la URL', () => {
    expect(
      leerConfigGateway({
        WHATSAPP_GATEWAY_URL: 'https://gw.test/',
        WHATSAPP_GATEWAY_API_KEY: 'k',
        WHATSAPP_INSTANCE: 'planeta',
      })
    ).toEqual({ url: 'https://gw.test', apiKey: 'k', instancia: 'planeta' })
  })
})

describe('enviarTexto', () => {
  it('manda number y text con la apikey y devuelve el id', async () => {
    const f = respuesta({ key: { id: 'WA1' } })
    const r = await enviarTexto(cfg, '5491112345678', 'hola', f)
    expect(r).toEqual({ waMessageId: 'WA1' })
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://gw.test/message/sendText/planeta')
    expect(init.method).toBe('POST')
    expect(init.headers.apikey).toBe('clave')
    expect(JSON.parse(init.body)).toEqual({ number: '5491112345678', text: 'hola' })
  })
  it('lanza ErrorGateway si el gateway responde con error', async () => {
    await expect(enviarTexto(cfg, '5491112345678', 'hola', respuesta({}, false, 500))).rejects.toBeInstanceOf(
      ErrorGateway
    )
  })
  it('lanza ErrorGateway si no hay conexión', async () => {
    const f = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch
    await expect(enviarTexto(cfg, '5491112345678', 'hola', f)).rejects.toBeInstanceOf(ErrorGateway)
  })
})

describe('consultarConexion', () => {
  it.each([
    ['open', 'abierta'],
    ['connecting', 'conectando'],
    ['close', 'cerrada'],
    ['raro', 'desconocido'],
  ])('traduce %s', async (estado, esperado) => {
    expect(await consultarConexion(cfg, respuesta({ instance: { state: estado } }))).toBe(esperado)
  })
})

describe('obtenerQr', () => {
  it('toma la imagen de base64 o de qrcode.base64', async () => {
    expect(await obtenerQr(cfg, respuesta({ base64: 'data:image/png;base64,AAA' }))).toBe('data:image/png;base64,AAA')
    expect(await obtenerQr(cfg, respuesta({ qrcode: { base64: 'data:image/png;base64,BBB' } }))).toBe(
      'data:image/png;base64,BBB'
    )
  })
  it('devuelve null si no hay imagen', async () => {
    expect(await obtenerQr(cfg, respuesta({ count: 0 }))).toBeNull()
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run lib/whatsapp/gateway.test.ts`
Expected: FAIL, "Failed to resolve import './gateway'".

- [ ] **Step 3: Implementar**

```ts
// lib/whatsapp/gateway.ts
// Único lugar que sabe cómo hablarle al gateway de WhatsApp (Evolution API). Solo para el servidor.
export interface ConfigGateway {
  url: string
  apiKey: string
  instancia: string
}

export type EstadoConexion = 'abierta' | 'conectando' | 'cerrada' | 'desconocido'

export class ErrorGateway extends Error {}

export function leerConfigGateway(
  env: Record<string, string | undefined> = process.env
): ConfigGateway | null {
  const url = env.WHATSAPP_GATEWAY_URL?.replace(/\/+$/, '')
  const apiKey = env.WHATSAPP_GATEWAY_API_KEY
  const instancia = env.WHATSAPP_INSTANCE
  return url && apiKey && instancia ? { url, apiKey, instancia } : null
}

async function pedir(
  cfg: ConfigGateway,
  ruta: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
  fetchFn: typeof fetch
): Promise<Record<string, unknown>> {
  let res: Response
  try {
    res = await fetchFn(`${cfg.url}${ruta}`, {
      method: init.method,
      headers: { 'Content-Type': 'application/json', apikey: cfg.apiKey },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(8000),
    })
  } catch (err) {
    throw new ErrorGateway('No se pudo conectar con el gateway', { cause: err })
  }
  if (!res.ok) throw new ErrorGateway(`El gateway respondió ${res.status}`)
  const cuerpo = await res.json().catch(() => ({}))
  return cuerpo && typeof cuerpo === 'object' ? (cuerpo as Record<string, unknown>) : {}
}

function anidado(obj: unknown, ...camino: string[]): unknown {
  let actual: unknown = obj
  for (const clave of camino) {
    if (!actual || typeof actual !== 'object') return undefined
    actual = (actual as Record<string, unknown>)[clave]
  }
  return actual
}

export async function enviarTexto(
  cfg: ConfigGateway,
  numero: string,
  texto: string,
  fetchFn: typeof fetch = fetch
): Promise<{ waMessageId: string | null }> {
  const cuerpo = await pedir(
    cfg,
    `/message/sendText/${encodeURIComponent(cfg.instancia)}`,
    { method: 'POST', body: { number: numero, text: texto } },
    fetchFn
  )
  const id = anidado(cuerpo, 'key', 'id')
  return { waMessageId: typeof id === 'string' ? id : null }
}

export async function consultarConexion(
  cfg: ConfigGateway,
  fetchFn: typeof fetch = fetch
): Promise<EstadoConexion> {
  const cuerpo = await pedir(
    cfg,
    `/instance/connectionState/${encodeURIComponent(cfg.instancia)}`,
    { method: 'GET' },
    fetchFn
  )
  const estado = anidado(cuerpo, 'instance', 'state')
  if (estado === 'open') return 'abierta'
  if (estado === 'connecting') return 'conectando'
  if (estado === 'close') return 'cerrada'
  return 'desconocido'
}

/** Imagen del QR (data URI en base64) para vincular el celular, o null si el gateway no la tiene. */
export async function obtenerQr(
  cfg: ConfigGateway,
  fetchFn: typeof fetch = fetch
): Promise<string | null> {
  const cuerpo = await pedir(
    cfg,
    `/instance/connect/${encodeURIComponent(cfg.instancia)}`,
    { method: 'GET' },
    fetchFn
  )
  const imagen = cuerpo.base64 ?? anidado(cuerpo, 'qrcode', 'base64')
  return typeof imagen === 'string' && imagen.startsWith('data:image') ? imagen : null
}
```

- [ ] **Step 4: Variables de entorno de ejemplo**

Agregar al final de `.env.local.example`:

```
WHATSAPP_GATEWAY_URL=
WHATSAPP_GATEWAY_API_KEY=
WHATSAPP_INSTANCE=
WHATSAPP_WEBHOOK_SECRET=
```

- [ ] **Step 5: Verificar que pasa**

Run: `npx vitest run lib/whatsapp/gateway.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/whatsapp/gateway.ts lib/whatsapp/gateway.test.ts .env.local.example
git commit -m "feat: cliente del gateway de WhatsApp"
```

---

### Task 6: Webhook

**Files:**
- Create: `lib/whatsapp/registro.ts`
- Test: `lib/whatsapp/registro.test.ts`
- Create: `lib/whatsapp/webhook.ts`
- Test: `lib/whatsapp/webhook.test.ts`
- Create: `app/api/whatsapp/webhook/[secreto]/route.ts`
- Modify: `proxy.ts`

**Interfaces:**
- Consumes: `normalizarTelefono` (Task 3), `interpretarEvento` (Task 4), función SQL `whatsapp_registrar_mensaje` (Task 2).
- Produces:
  - `RegistroMensaje = { telefono: string; clave: string; nombre: string | null; direccion: DireccionMensaje; texto: string; origen: OrigenMensajeWhatsapp; estado: EstadoMensajeWhatsapp; waMessageId: string | null; enviadoPor: string | null; reglaTipo: TipoReglaWhatsapp | null; proveedorId: string | null }`
  - `ResultadoRegistro = { conversacionId: string; mensajeId: string; esNuevo: boolean; primeraVez: boolean; proveedorId: string | null; clienteId: string | null }`
  - `registrarMensaje(admin: ReturnType<typeof createAdminClient>, m: RegistroMensaje): Promise<ResultadoRegistro>`
  - `secretoValido(recibido: string, esperado: string | undefined): boolean`
  - `procesarWebhook(body: unknown, registrar: (m: RegistroMensaje) => Promise<ResultadoRegistro>): Promise<{ resultado: ResultadoRegistro; telefono: string; clave: string; propio: boolean } | null>`

- [ ] **Step 1: Prueba de `registrarMensaje`**

```ts
// lib/whatsapp/registro.test.ts
import { describe, it, expect, vi } from 'vitest'
import { registrarMensaje, type RegistroMensaje } from './registro'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

const mensaje: RegistroMensaje = {
  telefono: '5491112345678',
  clave: '12345678',
  nombre: 'Ana',
  direccion: 'entrante',
  texto: 'Hola',
  origen: 'entrante',
  estado: 'enviado',
  waMessageId: 'WA1',
  enviadoPor: null,
  reglaTipo: null,
  proveedorId: null,
}

describe('registrarMensaje', () => {
  it('llama a la función SQL con los parámetros p_* y traduce la fila', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          conversacion_id: 'c1',
          mensaje_id: 'm1',
          es_nuevo: true,
          primera_vez: true,
          vinculo_proveedor_id: null,
          vinculo_cliente_id: 'cli1',
        },
      ],
      error: null,
    })
    const r = await registrarMensaje({ rpc } as unknown as Admin, mensaje)
    expect(rpc).toHaveBeenCalledWith('whatsapp_registrar_mensaje', {
      p_telefono: '5491112345678',
      p_clave: '12345678',
      p_nombre: 'Ana',
      p_direccion: 'entrante',
      p_texto: 'Hola',
      p_origen: 'entrante',
      p_estado: 'enviado',
      p_wa_message_id: 'WA1',
      p_enviado_por: null,
      p_regla_tipo: null,
      p_proveedor_id: null,
    })
    expect(r).toEqual({
      conversacionId: 'c1',
      mensajeId: 'm1',
      esNuevo: true,
      primeraVez: true,
      proveedorId: null,
      clienteId: 'cli1',
    })
  })

  it('lanza si la base devuelve error', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(registrarMensaje({ rpc } as unknown as Admin, mensaje)).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run lib/whatsapp/registro.test.ts`
Expected: FAIL, "Failed to resolve import './registro'".

- [ ] **Step 3: Implementar `registro.ts`**

```ts
// lib/whatsapp/registro.ts
import type { createAdminClient } from '@/lib/supabase/admin'
import type {
  DireccionMensaje,
  EstadoMensajeWhatsapp,
  OrigenMensajeWhatsapp,
  TipoReglaWhatsapp,
} from '@/types/database'

export interface RegistroMensaje {
  telefono: string
  clave: string
  nombre: string | null
  direccion: DireccionMensaje
  texto: string
  origen: OrigenMensajeWhatsapp
  estado: EstadoMensajeWhatsapp
  waMessageId: string | null
  enviadoPor: string | null
  reglaTipo: TipoReglaWhatsapp | null
  proveedorId: string | null
}

export interface ResultadoRegistro {
  conversacionId: string
  mensajeId: string
  esNuevo: boolean
  primeraVez: boolean
  proveedorId: string | null
  clienteId: string | null
}

interface FilaRegistro {
  conversacion_id: string
  mensaje_id: string
  es_nuevo: boolean
  primera_vez: boolean
  vinculo_proveedor_id: string | null
  vinculo_cliente_id: string | null
}

export async function registrarMensaje(
  admin: ReturnType<typeof createAdminClient>,
  m: RegistroMensaje
): Promise<ResultadoRegistro> {
  const { data, error } = await admin.rpc('whatsapp_registrar_mensaje', {
    p_telefono: m.telefono,
    p_clave: m.clave,
    p_nombre: m.nombre,
    p_direccion: m.direccion,
    p_texto: m.texto,
    p_origen: m.origen,
    p_estado: m.estado,
    p_wa_message_id: m.waMessageId,
    p_enviado_por: m.enviadoPor,
    p_regla_tipo: m.reglaTipo,
    p_proveedor_id: m.proveedorId,
  } as never)
  const fila = (data as FilaRegistro[] | null)?.[0]
  if (error || !fila) throw error ?? new Error('whatsapp_registrar_mensaje no devolvió filas')
  return {
    conversacionId: fila.conversacion_id,
    mensajeId: fila.mensaje_id,
    esNuevo: fila.es_nuevo,
    primeraVez: fila.primera_vez,
    proveedorId: fila.vinculo_proveedor_id,
    clienteId: fila.vinculo_cliente_id,
  }
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run lib/whatsapp/registro.test.ts`
Expected: PASS.

- [ ] **Step 5: Prueba de `webhook.ts`**

```ts
// lib/whatsapp/webhook.test.ts
import { describe, it, expect, vi } from 'vitest'
import { procesarWebhook, secretoValido } from './webhook'
import type { ResultadoRegistro } from './registro'

const resultado: ResultadoRegistro = {
  conversacionId: 'c1',
  mensajeId: 'm1',
  esNuevo: true,
  primeraVez: true,
  proveedorId: null,
  clienteId: null,
}

const aviso = (fromMe: boolean) => ({
  event: 'messages.upsert',
  data: {
    key: { remoteJid: '5491112345678@s.whatsapp.net', fromMe, id: 'WA1' },
    pushName: 'Ana',
    message: { conversation: 'Hola' },
  },
})

describe('secretoValido', () => {
  const secreto = 'a'.repeat(32)
  it('acepta solo el secreto exacto', () => {
    expect(secretoValido(secreto, secreto)).toBe(true)
    expect(secretoValido('b'.repeat(32), secreto)).toBe(false)
    expect(secretoValido('corto', secreto)).toBe(false)
  })
  it('rechaza todo si el secreto configurado falta o es débil', () => {
    expect(secretoValido('x', undefined)).toBe(false)
    expect(secretoValido('corto', 'corto')).toBe(false)
  })
})

describe('procesarWebhook', () => {
  it('registra un mensaje entrante con el teléfono normalizado', async () => {
    const registrar = vi.fn().mockResolvedValue(resultado)
    const r = await procesarWebhook(aviso(false), registrar)
    expect(registrar).toHaveBeenCalledWith({
      telefono: '5491112345678',
      clave: '12345678',
      nombre: 'Ana',
      direccion: 'entrante',
      texto: 'Hola',
      origen: 'entrante',
      estado: 'enviado',
      waMessageId: 'WA1',
      enviadoPor: null,
      reglaTipo: null,
      proveedorId: null,
    })
    expect(r).toEqual({ resultado, telefono: '5491112345678', clave: '12345678', propio: false })
  })

  it('registra lo escrito desde el celular como saliente manual', async () => {
    const registrar = vi.fn().mockResolvedValue({ ...resultado, primeraVez: false })
    const r = await procesarWebhook(aviso(true), registrar)
    expect(registrar).toHaveBeenCalledWith(
      expect.objectContaining({ direccion: 'saliente', origen: 'manual', nombre: null })
    )
    expect(r?.propio).toBe(true)
  })

  it('no registra lo que se ignora', async () => {
    const registrar = vi.fn()
    expect(await procesarWebhook({ event: 'connection.update', data: {} }, registrar)).toBeNull()
    expect(registrar).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Verificar que falla**

Run: `npx vitest run lib/whatsapp/webhook.test.ts`
Expected: FAIL, "Failed to resolve import './webhook'".

- [ ] **Step 7: Implementar `webhook.ts`**

```ts
// lib/whatsapp/webhook.ts
import { timingSafeEqual } from 'node:crypto'
import { interpretarEvento } from './entrante'
import { normalizarTelefono } from './telefono'
import type { RegistroMensaje, ResultadoRegistro } from './registro'

/** Compara el secreto de la URL con el configurado, sin filtrar información por tiempo de respuesta. */
export function secretoValido(recibido: string, esperado: string | undefined): boolean {
  if (!esperado || esperado.length < 24) return false
  const a = Buffer.from(recibido)
  const b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface MensajeProcesado {
  resultado: ResultadoRegistro
  telefono: string
  clave: string
  propio: boolean
}

/** Traduce un aviso del gateway y lo guarda. Devuelve null si no hay nada que guardar. */
export async function procesarWebhook(
  body: unknown,
  registrar: (m: RegistroMensaje) => Promise<ResultadoRegistro>
): Promise<MensajeProcesado | null> {
  const evento = interpretarEvento(body)
  if (evento.tipo !== 'mensaje') return null
  const telefono = normalizarTelefono(evento.jid)
  if (!telefono) return null

  const resultado = await registrar({
    telefono: telefono.digitos,
    clave: telefono.clave,
    nombre: evento.nombre,
    direccion: evento.propio ? 'saliente' : 'entrante',
    texto: evento.texto,
    origen: evento.propio ? 'manual' : 'entrante',
    estado: 'enviado',
    waMessageId: evento.waMessageId,
    enviadoPor: null,
    reglaTipo: null,
    proveedorId: null,
  })
  return { resultado, telefono: telefono.digitos, clave: telefono.clave, propio: evento.propio }
}
```

- [ ] **Step 8: Verificar que pasa**

Run: `npx vitest run lib/whatsapp/webhook.test.ts`
Expected: PASS.

- [ ] **Step 9: Ruta del webhook**

```ts
// app/api/whatsapp/webhook/[secreto]/route.ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarMensaje } from '@/lib/whatsapp/registro'
import { procesarWebhook, secretoValido } from '@/lib/whatsapp/webhook'

// El gateway no tiene sesión de usuario: esta ruta se protege con el secreto que lleva en la URL
// (proxy.ts la deja pasar sin sesión). Responde 200 aunque ignore el aviso, para que el gateway no reintente.
export async function POST(request: Request, ctx: RouteContext<'/api/whatsapp/webhook/[secreto]'>) {
  const { secreto } = await ctx.params
  if (!secretoValido(secreto, process.env.WHATSAPP_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const admin = createAdminClient()
  try {
    await procesarWebhook(body, (m) => registrarMensaje(admin, m))
  } catch (err) {
    // 500 para que el gateway reintente: guardar es idempotente por wa_message_id.
    console.error('No se pudo guardar el mensaje de WhatsApp:', err)
    return NextResponse.json({ error: 'No se pudo guardar el mensaje.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 10: Dejar pasar el webhook en `proxy.ts`**

En `proxy.ts`, reemplazar:

```ts
  if (isLinkDeMailRoute) return response
```
por:

```ts
  // El gateway de WhatsApp no tiene sesión: esa ruta se protege con el secreto de su URL.
  const isWebhookWhatsapp = request.nextUrl.pathname.startsWith('/api/whatsapp/webhook/')

  if (isLinkDeMailRoute || isWebhookWhatsapp) return response
```

- [ ] **Step 11: Verificar tipos y tests**

Run: `npx next typegen && npm run typecheck && npx vitest run lib/whatsapp`
Expected: sin errores; todas las pruebas de `lib/whatsapp` pasan. (`RouteContext` es un tipo global que Next genera con `next typegen`, `next dev` o `next build`; sin eso el typecheck no lo encuentra.)

- [ ] **Step 12: Commit**

```bash
git add lib/whatsapp/registro.ts lib/whatsapp/registro.test.ts lib/whatsapp/webhook.ts lib/whatsapp/webhook.test.ts "app/api/whatsapp/webhook/[secreto]/route.ts" proxy.ts
git commit -m "feat: webhook de WhatsApp protegido por secreto"
```

---

### Task 7: Envío de mensajes

**Files:**
- Create: `lib/whatsapp/envio.ts`
- Test: `lib/whatsapp/envio.test.ts`
- Create: `app/api/whatsapp/enviar/route.ts`

**Interfaces:**
- Consumes: `RegistroMensaje`, `ResultadoRegistro` (Task 6), `numeroParaEnviar`, `normalizarTelefono` (Task 3).
- Produces:
  - `PedidoEnvio = { tipo: 'conversacion'; conversacionId: string; texto: string } | { tipo: 'pedido'; telefono: string; proveedorId: string; texto: string } | { tipo: 'reintento'; mensajeId: string }`
  - `validarPedidoEnvio(body: unknown): PedidoEnvio | { error: string }`
  - `DepsEnvio` y `ejecutarEnvio(pedido, usuarioId, deps): Promise<{ status: number; cuerpo: Record<string, unknown> }>`
  - Contrato HTTP de `POST /api/whatsapp/enviar`: cuerpos `{ conversacionId, texto }`, `{ origen: 'pedido', telefono, proveedorId, texto }` o `{ mensajeId }`; respuesta `{ ok: true, mensajeId }` o `{ ok: false, error, mensajeId? }`.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
// lib/whatsapp/envio.test.ts
import { describe, it, expect, vi } from 'vitest'
import { ejecutarEnvio, validarPedidoEnvio, type DepsEnvio } from './envio'

const UUID = '11111111-1111-4111-8111-111111111111'

describe('validarPedidoEnvio', () => {
  it('acepta un mensaje a una conversación', () => {
    expect(validarPedidoEnvio({ conversacionId: UUID, texto: ' hola ' })).toEqual({
      tipo: 'conversacion',
      conversacionId: UUID,
      texto: 'hola',
    })
  })
  it('acepta un pedido a proveedor', () => {
    expect(
      validarPedidoEnvio({ origen: 'pedido', telefono: '11 4444-5555', proveedorId: UUID, texto: 'pedido' })
    ).toEqual({ tipo: 'pedido', telefono: '11 4444-5555', proveedorId: UUID, texto: 'pedido' })
  })
  it('acepta un reintento', () => {
    expect(validarPedidoEnvio({ mensajeId: UUID })).toEqual({ tipo: 'reintento', mensajeId: UUID })
  })
  it.each([
    [null],
    [{}],
    [{ conversacionId: 'no-es-uuid', texto: 'x' }],
    [{ conversacionId: UUID, texto: '   ' }],
    [{ conversacionId: UUID, texto: 'x'.repeat(4097) }],
    [{ origen: 'pedido', telefono: '1', texto: 'x' }],
  ])('rechaza %j', (cuerpo) => {
    expect('error' in validarPedidoEnvio(cuerpo)).toBe(true)
  })
})

function deps(sobre: Partial<DepsEnvio> = {}): DepsEnvio {
  return {
    telefonoDeConversacion: vi.fn().mockResolvedValue('5491112345678'),
    mensajeParaReintento: vi.fn().mockResolvedValue({ id: 'm9', texto: 'hola', conversacionId: 'c1' }),
    enviarTexto: vi.fn().mockResolvedValue({ waMessageId: 'WA1' }),
    registrar: vi.fn().mockResolvedValue({
      conversacionId: 'c1',
      mensajeId: 'm1',
      esNuevo: true,
      primeraVez: false,
      proveedorId: null,
      clienteId: null,
    }),
    marcarMensaje: vi.fn().mockResolvedValue(undefined),
    ...sobre,
  }
}

describe('ejecutarEnvio', () => {
  it('envía a una conversación y registra el mensaje con quién lo mandó', async () => {
    const d = deps()
    const r = await ejecutarEnvio({ tipo: 'conversacion', conversacionId: 'c1', texto: 'hola' }, 'user1', d)
    expect(r).toEqual({ status: 200, cuerpo: { ok: true, mensajeId: 'm1', conversacionId: 'c1' } })
    expect(d.enviarTexto).toHaveBeenCalledWith('5491112345678', 'hola')
    expect(d.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        direccion: 'saliente',
        origen: 'manual',
        estado: 'enviado',
        waMessageId: 'WA1',
        enviadoPor: 'user1',
      })
    )
  })

  it('arma el número del pedido y vincula al proveedor', async () => {
    const d = deps()
    await ejecutarEnvio(
      { tipo: 'pedido', telefono: '011 15 4444-5555', proveedorId: 'p1', texto: 'pedido' },
      'user1',
      d
    )
    expect(d.enviarTexto).toHaveBeenCalledWith('5491144445555', 'pedido')
    expect(d.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ telefono: '5491144445555', origen: 'pedido', proveedorId: 'p1' })
    )
  })

  it('rechaza un teléfono de proveedor que no se reconoce, sin enviar nada', async () => {
    const d = deps()
    const r = await ejecutarEnvio({ tipo: 'pedido', telefono: 'abc', proveedorId: 'p1', texto: 'x' }, 'u', d)
    expect(r.status).toBe(400)
    expect(d.enviarTexto).not.toHaveBeenCalled()
  })

  it('si el gateway falla, guarda el mensaje con error para poder reintentar', async () => {
    const d = deps({ enviarTexto: vi.fn().mockRejectedValue(new Error('caído')) })
    const r = await ejecutarEnvio({ tipo: 'conversacion', conversacionId: 'c1', texto: 'hola' }, 'u', d)
    expect(r.status).toBe(502)
    expect(r.cuerpo).toMatchObject({ ok: false, mensajeId: 'm1' })
    expect(d.registrar).toHaveBeenCalledWith(expect.objectContaining({ estado: 'error', waMessageId: null }))
  })

  it('devuelve 404 si la conversación no existe', async () => {
    const d = deps({ telefonoDeConversacion: vi.fn().mockResolvedValue(null) })
    const r = await ejecutarEnvio({ tipo: 'conversacion', conversacionId: 'x', texto: 'hola' }, 'u', d)
    expect(r.status).toBe(404)
  })

  it('reintenta un mensaje con error y lo marca como enviado', async () => {
    const d = deps()
    const r = await ejecutarEnvio({ tipo: 'reintento', mensajeId: 'm9' }, 'u', d)
    expect(r).toEqual({ status: 200, cuerpo: { ok: true, mensajeId: 'm9' } })
    expect(d.marcarMensaje).toHaveBeenCalledWith('m9', { estado: 'enviado', waMessageId: 'WA1' })
  })

  it('si el reintento vuelve a fallar, devuelve 502 y no cambia el mensaje', async () => {
    const d = deps({ enviarTexto: vi.fn().mockRejectedValue(new Error('caído')) })
    const r = await ejecutarEnvio({ tipo: 'reintento', mensajeId: 'm9' }, 'u', d)
    expect(r.status).toBe(502)
    expect(d.marcarMensaje).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run lib/whatsapp/envio.test.ts`
Expected: FAIL, "Failed to resolve import './envio'".

- [ ] **Step 3: Implementar `envio.ts`**

```ts
// lib/whatsapp/envio.ts
import { normalizarTelefono, numeroParaEnviar } from './telefono'
import type { RegistroMensaje, ResultadoRegistro } from './registro'

export type PedidoEnvio =
  | { tipo: 'conversacion'; conversacionId: string; texto: string }
  | { tipo: 'pedido'; telefono: string; proveedorId: string; texto: string }
  | { tipo: 'reintento'; mensajeId: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TEXTO = 4096
const ERROR_GATEWAY = 'No se pudo enviar el mensaje. Revisá la conexión de WhatsApp e intentá de nuevo.'

export function validarPedidoEnvio(body: unknown): PedidoEnvio | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Datos inválidos' }
  const b = body as Record<string, unknown>

  if (typeof b.mensajeId === 'string' && UUID.test(b.mensajeId)) {
    return { tipo: 'reintento', mensajeId: b.mensajeId }
  }

  const texto = typeof b.texto === 'string' ? b.texto.trim() : ''
  if (texto.length < 1 || texto.length > MAX_TEXTO) return { error: 'El mensaje está vacío o es demasiado largo.' }

  if (b.origen === 'pedido') {
    if (
      typeof b.telefono !== 'string' ||
      b.telefono.length > 40 ||
      typeof b.proveedorId !== 'string' ||
      !UUID.test(b.proveedorId)
    ) {
      return { error: 'Datos inválidos' }
    }
    return { tipo: 'pedido', telefono: b.telefono, proveedorId: b.proveedorId, texto }
  }

  if (typeof b.conversacionId === 'string' && UUID.test(b.conversacionId)) {
    return { tipo: 'conversacion', conversacionId: b.conversacionId, texto }
  }
  return { error: 'Datos inválidos' }
}

export interface DepsEnvio {
  telefonoDeConversacion(conversacionId: string): Promise<string | null>
  mensajeParaReintento(
    mensajeId: string
  ): Promise<{ id: string; texto: string; conversacionId: string } | null>
  enviarTexto(numero: string, texto: string): Promise<{ waMessageId: string | null }>
  registrar(m: RegistroMensaje): Promise<ResultadoRegistro>
  marcarMensaje(
    mensajeId: string,
    cambios: { estado: 'enviado' | 'error'; waMessageId: string | null }
  ): Promise<void>
}

interface Respuesta {
  status: number
  cuerpo: Record<string, unknown>
}

const noEncontrado = (): Respuesta => ({
  status: 404,
  cuerpo: { ok: false, error: 'No se encontró la conversación o el mensaje.' },
})

export async function ejecutarEnvio(
  pedido: PedidoEnvio,
  usuarioId: string,
  deps: DepsEnvio
): Promise<Respuesta> {
  if (pedido.tipo === 'reintento') {
    const mensaje = await deps.mensajeParaReintento(pedido.mensajeId)
    if (!mensaje) return noEncontrado()
    const telefono = await deps.telefonoDeConversacion(mensaje.conversacionId)
    if (!telefono) return noEncontrado()
    try {
      const { waMessageId } = await deps.enviarTexto(telefono, mensaje.texto)
      await deps.marcarMensaje(mensaje.id, { estado: 'enviado', waMessageId })
    } catch (err) {
      console.error('Falló el reintento de WhatsApp:', err)
      return { status: 502, cuerpo: { ok: false, error: ERROR_GATEWAY } }
    }
    return { status: 200, cuerpo: { ok: true, mensajeId: mensaje.id } }
  }

  let numero: string | null
  let proveedorId: string | null = null
  if (pedido.tipo === 'conversacion') {
    numero = await deps.telefonoDeConversacion(pedido.conversacionId)
    if (!numero) return noEncontrado()
  } else {
    numero = numeroParaEnviar(pedido.telefono)
    if (!numero) {
      return {
        status: 400,
        cuerpo: { ok: false, error: 'Revisá el teléfono del proveedor: no parece un celular argentino.' },
      }
    }
    proveedorId = pedido.proveedorId
  }

  const normalizado = normalizarTelefono(numero)
  if (!normalizado) return noEncontrado()

  const base: RegistroMensaje = {
    telefono: normalizado.digitos,
    clave: normalizado.clave,
    nombre: null,
    direccion: 'saliente',
    texto: pedido.texto,
    origen: pedido.tipo === 'pedido' ? 'pedido' : 'manual',
    estado: 'enviado',
    waMessageId: null,
    enviadoPor: usuarioId,
    reglaTipo: null,
    proveedorId,
  }

  let waMessageId: string | null
  try {
    ;({ waMessageId } = await deps.enviarTexto(numero, pedido.texto))
  } catch (err) {
    console.error('Falló el envío de WhatsApp:', err)
    const guardado = await deps.registrar({ ...base, estado: 'error' })
    return {
      status: 502,
      cuerpo: {
        ok: false,
        error: ERROR_GATEWAY,
        mensajeId: guardado.mensajeId,
        conversacionId: guardado.conversacionId,
      },
    }
  }

  const guardado = await deps.registrar({ ...base, waMessageId })
  return {
    status: 200,
    cuerpo: { ok: true, mensajeId: guardado.mensajeId, conversacionId: guardado.conversacionId },
  }
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run lib/whatsapp/envio.test.ts`
Expected: PASS.

- [ ] **Step 5: Ruta**

```ts
// app/api/whatsapp/enviar/route.ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { limitarUso } from '@/lib/auth/limitarUso'
import { requerirAdministrador } from '@/lib/auth/requerirAdministrador'
import { requerirSesion } from '@/lib/auth/requerirSesion'
import { ejecutarEnvio, validarPedidoEnvio, type DepsEnvio } from '@/lib/whatsapp/envio'
import { enviarTexto, leerConfigGateway } from '@/lib/whatsapp/gateway'
import { registrarMensaje } from '@/lib/whatsapp/registro'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const pedido = validarPedidoEnvio(body)
  if ('error' in pedido) return NextResponse.json({ ok: false, error: pedido.error }, { status: 400 })

  // Los pedidos a proveedores nacen en Reposición, que es solo de administradores.
  const auth = pedido.tipo === 'pedido' ? await requerirAdministrador() : await requerirSesion()
  if (auth.error) return auth.error

  const limite = await limitarUso('whatsapp-enviar', 30, 60)
  if (limite) return limite

  const cfg = leerConfigGateway()
  if (!cfg) {
    return NextResponse.json({ ok: false, error: 'WhatsApp todavía no está configurado.' }, { status: 503 })
  }

  const admin = createAdminClient()
  const deps: DepsEnvio = {
    async telefonoDeConversacion(id) {
      const { data } = await admin.from('whatsapp_conversaciones').select('telefono').eq('id', id).maybeSingle()
      return (data as { telefono: string } | null)?.telefono ?? null
    },
    async mensajeParaReintento(id) {
      const { data } = await admin
        .from('whatsapp_mensajes')
        .select('id, texto, conversacion_id')
        .eq('id', id)
        .eq('direccion', 'saliente')
        .eq('estado', 'error')
        .maybeSingle()
      const fila = data as { id: string; texto: string; conversacion_id: string } | null
      return fila ? { id: fila.id, texto: fila.texto, conversacionId: fila.conversacion_id } : null
    },
    enviarTexto: (numero, texto) => enviarTexto(cfg, numero, texto),
    registrar: (m) => registrarMensaje(admin, m),
    async marcarMensaje(id, cambios) {
      const { error } = await admin
        .from('whatsapp_mensajes')
        .update({ estado: cambios.estado, wa_message_id: cambios.waMessageId } as never)
        .eq('id', id)
      if (error) throw error
    },
  }

  try {
    const { status, cuerpo } = await ejecutarEnvio(pedido, auth.user.id, deps)
    return NextResponse.json(cuerpo, { status })
  } catch (err) {
    console.error('Error al enviar el mensaje de WhatsApp:', err)
    return NextResponse.json(
      { ok: false, error: 'No se pudo enviar el mensaje. Intentá de nuevo.' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 6: Verificar tipos y tests**

Run: `npm run typecheck && npx vitest run lib/whatsapp`
Expected: sin errores; pruebas en verde.

- [ ] **Step 7: Commit**

```bash
git add lib/whatsapp/envio.ts lib/whatsapp/envio.test.ts app/api/whatsapp/enviar/route.ts
git commit -m "feat: envío de mensajes de WhatsApp con reintento"
```

---

### Task 8: Estado de la conexión, capa de datos y presentación

**Files:**
- Create: `app/api/whatsapp/conexion/route.ts`
- Create: `lib/whatsapp/presentacion.ts`
- Test: `lib/whatsapp/presentacion.test.ts`
- Create: `lib/data/whatsapp.ts`

**Interfaces:**
- Produces:
  - `GET /api/whatsapp/conexion` → `{ estado: EstadoConexion }`; con `?qr=1` y rol administrador → `{ estado, qr: string | null }`.
  - `nombreParaMostrar(c: ConversacionConVinculo): string`, `etiquetaVinculo(c: ConversacionConVinculo): string`.
  - En `lib/data/whatsapp.ts`: `ConversacionConVinculo`, `listarConversaciones()`, `listarMensajes(conversacionId, limite?)`, `marcarLeida(conversacionId)`, `vincularConversacion(id, destino)`, `suscribirseAConversaciones(alCambiar): () => void`, `suscribirseAMensajes(conversacionId, alCambiar): () => void`.

- [ ] **Step 1: Prueba de presentación**

```ts
// lib/whatsapp/presentacion.test.ts
import { describe, it, expect } from 'vitest'
import { etiquetaVinculo, nombreParaMostrar } from './presentacion'
import type { ConversacionConVinculo } from '@/lib/data/whatsapp'

function conversacion(sobre: Partial<ConversacionConVinculo> = {}): ConversacionConVinculo {
  return {
    id: 'c1',
    telefono: '5491112345678',
    clave: '12345678',
    nombre_whatsapp: null,
    proveedor_id: null,
    cliente_id: null,
    ultimo_mensaje_en: '2026-11-03T12:00:00Z',
    ultimo_texto: null,
    no_leidos: 0,
    creado_en: '2026-11-03T12:00:00Z',
    proveedor: null,
    cliente: null,
    ...sobre,
  }
}

describe('nombreParaMostrar', () => {
  it('prefiere el proveedor o cliente vinculado', () => {
    expect(nombreParaMostrar(conversacion({ proveedor: { id: 'p', nombre: 'Distribuidora Sur' } }))).toBe('Distribuidora Sur')
    expect(nombreParaMostrar(conversacion({ cliente: { id: 'k', nombre: 'Ana Pérez' } }))).toBe('Ana Pérez')
  })
  it('sigue con el nombre de WhatsApp y después con el teléfono', () => {
    expect(nombreParaMostrar(conversacion({ nombre_whatsapp: 'Ana' }))).toBe('Ana')
    expect(nombreParaMostrar(conversacion())).toBe('+54 9 11 1234-5678')
  })
})

describe('etiquetaVinculo', () => {
  it('nombra el tipo de vínculo', () => {
    expect(etiquetaVinculo(conversacion({ proveedor: { id: 'p', nombre: 'X' } }))).toBe('Proveedor')
    expect(etiquetaVinculo(conversacion({ cliente: { id: 'k', nombre: 'X' } }))).toBe('Cliente')
    expect(etiquetaVinculo(conversacion())).toBe('Sin vincular')
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run lib/whatsapp/presentacion.test.ts`
Expected: FAIL, "Failed to resolve import './presentacion'".

- [ ] **Step 3: Implementar `presentacion.ts`**

```ts
// lib/whatsapp/presentacion.ts
import type { ConversacionConVinculo } from '@/lib/data/whatsapp'

function formatearTelefono(digitos: string): string {
  const m = digitos.match(/^54(9)(\d{2})(\d{4})(\d{4})$/)
  return m ? `+54 ${m[1]} ${m[2]} ${m[3]}-${m[4]}` : `+${digitos}`
}

export function nombreParaMostrar(c: ConversacionConVinculo): string {
  return c.proveedor?.nombre ?? c.cliente?.nombre ?? c.nombre_whatsapp ?? formatearTelefono(c.telefono)
}

export function etiquetaVinculo(c: ConversacionConVinculo): string {
  if (c.proveedor) return 'Proveedor'
  if (c.cliente) return 'Cliente'
  return 'Sin vincular'
}
```

- [ ] **Step 4: Capa de datos del navegador**

```ts
// lib/data/whatsapp.ts
import { createClient } from '@/lib/supabase/client'
import type { Cliente, Conversacion, Mensaje, Proveedor } from '@/types/database'

export interface ConversacionConVinculo extends Conversacion {
  proveedor: Pick<Proveedor, 'id' | 'nombre'> | null
  cliente: Pick<Cliente, 'id' | 'nombre'> | null
}

export async function listarConversaciones(): Promise<ConversacionConVinculo[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('whatsapp_conversaciones')
    .select('*, proveedor:proveedores(id, nombre), cliente:clientes(id, nombre)')
    .order('ultimo_mensaje_en', { ascending: false })
  if (error) throw error
  return data as unknown as ConversacionConVinculo[]
}

export async function listarMensajes(conversacionId: string, limite = 300): Promise<Mensaje[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('whatsapp_mensajes')
    .select('*')
    .eq('conversacion_id', conversacionId)
    .order('creado_en', { ascending: false })
    .limit(limite)
  if (error) throw error
  return (data as Mensaje[]).reverse()
}

export async function marcarLeida(conversacionId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('whatsapp_conversaciones')
    .update({ no_leidos: 0 } as never)
    .eq('id', conversacionId)
    .gt('no_leidos', 0)
  if (error) throw error
}

/** Asocia el chat a un proveedor o cliente (o lo desvincula con null). Un chat tiene un solo vínculo. */
export async function vincularConversacion(
  id: string,
  destino: { proveedorId: string } | { clienteId: string } | null
): Promise<void> {
  const supabase = createClient()
  const cambios = {
    proveedor_id: destino && 'proveedorId' in destino ? destino.proveedorId : null,
    cliente_id: destino && 'clienteId' in destino ? destino.clienteId : null,
  }
  const { error } = await supabase.from('whatsapp_conversaciones').update(cambios as never).eq('id', id)
  if (error) throw error
}

function suscribirse(nombre: string, tabla: string, filtro: string | undefined, alCambiar: () => void) {
  const supabase = createClient()
  const canal = supabase
    .channel(nombre)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: tabla, ...(filtro ? { filter: filtro } : {}) },
      alCambiar
    )
    .subscribe()
  return () => {
    supabase.removeChannel(canal)
  }
}

export function suscribirseAConversaciones(alCambiar: () => void): () => void {
  return suscribirse('whatsapp-conversaciones', 'whatsapp_conversaciones', undefined, alCambiar)
}

export function suscribirseAMensajes(conversacionId: string, alCambiar: () => void): () => void {
  return suscribirse(
    `whatsapp-mensajes-${conversacionId}`,
    'whatsapp_mensajes',
    `conversacion_id=eq.${conversacionId}`,
    alCambiar
  )
}
```

- [ ] **Step 5: Ruta de conexión**

```ts
// app/api/whatsapp/conexion/route.ts
import { NextResponse } from 'next/server'
import { requerirAdministrador } from '@/lib/auth/requerirAdministrador'
import { requerirSesion } from '@/lib/auth/requerirSesion'
import { consultarConexion, leerConfigGateway, obtenerQr, type EstadoConexion } from '@/lib/whatsapp/gateway'

export async function GET(request: Request) {
  const pideQr = new URL(request.url).searchParams.get('qr') === '1'
  // El estado lo ve cualquier usuario (para el aviso); el QR vincula el número, así que es solo del administrador.
  const auth = pideQr ? await requerirAdministrador() : await requerirSesion()
  if (auth.error) return auth.error

  const cfg = leerConfigGateway()
  if (!cfg) return NextResponse.json({ estado: 'desconocido' satisfies EstadoConexion, sinConfigurar: true })

  try {
    const estado = await consultarConexion(cfg)
    if (!pideQr || estado === 'abierta') return NextResponse.json({ estado })
    return NextResponse.json({ estado, qr: await obtenerQr(cfg) })
  } catch (err) {
    console.error('No se pudo consultar el gateway de WhatsApp:', err)
    return NextResponse.json({ estado: 'desconocido' satisfies EstadoConexion })
  }
}
```

- [ ] **Step 6: Verificar**

Run: `npm run typecheck && npx vitest run lib/whatsapp`
Expected: sin errores; pruebas en verde. Si `select('*, proveedor:proveedores(...)')` marca error de tipos, confirmar que `types/supabase.ts` (Task 2, Step 5) trae las `Relationships` de `whatsapp_conversaciones`.

- [ ] **Step 7: Commit**

```bash
git add app/api/whatsapp/conexion/route.ts lib/whatsapp/presentacion.ts lib/whatsapp/presentacion.test.ts lib/data/whatsapp.ts
git commit -m "feat: capa de datos, tiempo real y estado de conexión de WhatsApp"
```

---

### Task 9: Pantalla de la bandeja

**Files:**
- Create: `app/(app)/whatsapp/page.tsx`
- Create: `app/(app)/whatsapp/ListaConversaciones.tsx`
- Create: `app/(app)/whatsapp/ChatPanel.tsx`
- Create: `app/(app)/whatsapp/VincularConversacion.tsx`
- Create: `app/(app)/whatsapp/AvisoConexion.tsx`
- Modify: `components/Sidebar.tsx`

**Interfaces:**
- Consumes: todo lo de `lib/data/whatsapp.ts`, `nombreParaMostrar`, `etiquetaVinculo`, `POST /api/whatsapp/enviar`, `GET /api/whatsapp/conexion`, `listarProveedores` (`lib/data/proveedores.ts`), `listarClientes` y `crearCliente` (`lib/data/clientes.ts`), `useEsAdministrador`.

- [ ] **Step 1: Aviso de conexión**

```tsx
// app/(app)/whatsapp/AvisoConexion.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'

export function AvisoConexion() {
  const esAdmin = useEsAdministrador()
  const [estado, setEstado] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    const consultar = () =>
      fetch('/api/whatsapp/conexion')
        .then((r) => r.json())
        .then((d) => activo && setEstado(d.estado))
        .catch(() => activo && setEstado('desconocido'))
    consultar()
    const timer = setInterval(consultar, 30_000)
    return () => {
      activo = false
      clearInterval(timer)
    }
  }, [])

  if (estado === null || estado === 'abierta') return null
  return (
    <div className="card rise flex flex-wrap items-center justify-between gap-2 border border-negative p-3 text-sm text-negative">
      <span>WhatsApp está desconectado: los mensajes nuevos no van a llegar ni se van a poder enviar.</span>
      {esAdmin && (
        <Link href="/whatsapp/conexion" className="font-semibold underline">
          Vincular el número
        </Link>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Lista de conversaciones**

```tsx
// app/(app)/whatsapp/ListaConversaciones.tsx
'use client'

import type { ConversacionConVinculo } from '@/lib/data/whatsapp'
import { etiquetaVinculo, nombreParaMostrar } from '@/lib/whatsapp/presentacion'

interface Props {
  conversaciones: ConversacionConVinculo[]
  seleccionada: string | null
  onSeleccionar: (id: string) => void
}

export function ListaConversaciones({ conversaciones, seleccionada, onSeleccionar }: Props) {
  if (conversaciones.length === 0) {
    return <p className="p-5 text-sm text-ink-faint">Todavía no hay conversaciones.</p>
  }
  return (
    <ul className="divide-y divide-line">
      {conversaciones.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => onSeleccionar(c.id)}
            className={`flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-ink/5 ${
              seleccionada === c.id ? 'bg-ink/5' : ''
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-ink">{nombreParaMostrar(c)}</span>
              {c.no_leidos > 0 && <span className="chip up">{c.no_leidos}</span>}
            </span>
            <span className="text-[11px] uppercase tracking-[0.1em] text-ink-faint">{etiquetaVinculo(c)}</span>
            <span className="truncate text-xs text-ink-soft">{c.ultimo_texto ?? ''}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 3: Vincular chat con cliente o proveedor**

```tsx
// app/(app)/whatsapp/VincularConversacion.tsx
'use client'

import { useEffect, useState } from 'react'
import { listarProveedores } from '@/lib/data/proveedores'
import { crearCliente, listarClientes } from '@/lib/data/clientes'
import { vincularConversacion, type ConversacionConVinculo } from '@/lib/data/whatsapp'
import type { Cliente, Proveedor } from '@/types/database'

export function VincularConversacion({
  conversacion,
  onCambio,
}: {
  conversacion: ConversacionConVinculo
  onCambio: () => void
}) {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [eleccion, setEleccion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const vinculado = conversacion.proveedor_id !== null || conversacion.cliente_id !== null

  useEffect(() => {
    if (vinculado) return
    Promise.all([listarProveedores(), listarClientes()])
      .then(([p, c]) => {
        setProveedores(p)
        setClientes(c)
      })
      .catch(() => setError('No se pudieron cargar los contactos.'))
  }, [vinculado])

  async function ejecutar(accion: () => Promise<void>) {
    setError(null)
    try {
      await accion()
      onCambio()
    } catch {
      setError('No se pudo guardar el vínculo. Intentá de nuevo.')
    }
  }

  if (vinculado) {
    return (
      <button
        type="button"
        onClick={() => ejecutar(() => vincularConversacion(conversacion.id, null))}
        className="text-xs text-ink-faint underline"
      >
        Desvincular
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <select
        value={eleccion}
        onChange={(e) => setEleccion(e.target.value)}
        className="rounded-[var(--r-sm)] border border-line bg-surface p-1.5 text-ink"
      >
        <option value="">Vincular con…</option>
        <optgroup label="Proveedores">
          {proveedores.map((p) => (
            <option key={p.id} value={`p:${p.id}`}>
              {p.nombre}
            </option>
          ))}
        </optgroup>
        <optgroup label="Clientes">
          {clientes.map((c) => (
            <option key={c.id} value={`c:${c.id}`}>
              {c.nombre}
            </option>
          ))}
        </optgroup>
      </select>
      <button
        type="button"
        disabled={!eleccion}
        onClick={() =>
          ejecutar(() =>
            vincularConversacion(
              conversacion.id,
              eleccion.startsWith('p:') ? { proveedorId: eleccion.slice(2) } : { clienteId: eleccion.slice(2) }
            )
          )
        }
        className="pill-btn"
      >
        Vincular
      </button>
      <button
        type="button"
        onClick={() =>
          ejecutar(async () => {
            const cliente = await crearCliente({
              nombre: conversacion.nombre_whatsapp ?? `+${conversacion.telefono}`,
              telefono: conversacion.telefono,
              email: null,
            })
            await vincularConversacion(conversacion.id, { clienteId: cliente.id })
          })
        }
        className="text-ink-faint underline"
      >
        Crear cliente con este número
      </button>
      {error && <span className="text-negative">{error}</span>}
    </div>
  )
}
```

- [ ] **Step 4: Panel del chat**

```tsx
// app/(app)/whatsapp/ChatPanel.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import {
  listarMensajes,
  marcarLeida,
  suscribirseAMensajes,
  type ConversacionConVinculo,
} from '@/lib/data/whatsapp'
import { etiquetaVinculo, nombreParaMostrar } from '@/lib/whatsapp/presentacion'
import type { Mensaje } from '@/types/database'
import { VincularConversacion } from './VincularConversacion'

const hora = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })

async function llamarEnviar(cuerpo: object): Promise<{ ok: boolean; error?: string; mensajeId?: string }> {
  const res = await fetch('/api/whatsapp/enviar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  })
  const datos = await res.json().catch(() => ({}))
  return { ok: res.ok, error: datos.error, mensajeId: datos.mensajeId }
}

export function ChatPanel({
  conversacion,
  onCambio,
}: {
  conversacion: ConversacionConVinculo
  onCambio: () => void
}) {
  const id = conversacion.id
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fin = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let activo = true
    const cargar = () =>
      listarMensajes(id)
        .then((m) => activo && setMensajes(m))
        .catch(() => {})
    const alCambiar = () => {
      cargar()
      marcarLeida(id).then(onCambio).catch(() => {})
    }
    alCambiar()
    const cancelar = suscribirseAMensajes(id, alCambiar)
    return () => {
      activo = false
      cancelar()
    }
  }, [id, onCambio])

  useEffect(() => {
    fin.current?.scrollIntoView({ block: 'end' })
  }, [mensajes])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const limpio = texto.trim()
    if (!limpio || enviando) return
    setEnviando(true)
    setError(null)
    const r = await llamarEnviar({ conversacionId: id, texto: limpio })
    setEnviando(false)
    if (r.ok || r.mensajeId) setTexto('')
    if (!r.ok) setError(r.error ?? 'No se pudo enviar el mensaje.')
  }

  async function reintentar(mensajeId: string) {
    setError(null)
    const r = await llamarEnviar({ mensajeId })
    if (!r.ok) setError(r.error ?? 'No se pudo reenviar el mensaje.')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-1 border-b border-line px-4 py-3">
        <p className="text-sm font-semibold text-ink">
          {nombreParaMostrar(conversacion)}{' '}
          <span className="text-[11px] font-normal uppercase tracking-[0.1em] text-ink-faint">
            {etiquetaVinculo(conversacion)}
          </span>
        </p>
        <VincularConversacion conversacion={conversacion} onCambio={onCambio} />
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        {mensajes.map((m) => {
          const propio = m.direccion === 'saliente'
          return (
            <div key={m.id} className={`flex ${propio ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                  propio ? 'bg-accent text-accent-ink' : 'border border-line bg-surface text-ink'
                }`}
              >
                {m.texto}
                <p className="mt-1 text-[10.5px] opacity-70">
                  {hora.format(new Date(m.creado_en))}
                  {m.origen === 'automatico' && ' · automático'}
                  {m.origen === 'pedido' && ' · pedido'}
                  {m.estado === 'pendiente' && ' · enviando…'}
                </p>
                {m.estado === 'error' && (
                  <button type="button" onClick={() => reintentar(m.id)} className="mt-1 text-xs font-semibold underline">
                    No se envió · Reintentar
                  </button>
                )}
              </div>
            </div>
          )
        })}
        <div ref={fin} />
      </div>

      <form onSubmit={enviar} className="flex flex-col gap-2 border-t border-line p-3">
        {error && <p className="text-xs text-negative">{error}</p>}
        <div className="flex gap-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={2}
            maxLength={4096}
            placeholder="Escribí un mensaje"
            className="flex-1 resize-none rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none focus:border-accent"
          />
          <button type="submit" disabled={enviando || !texto.trim()} className="pill-btn self-end">
            {enviando ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 5: Página**

```tsx
// app/(app)/whatsapp/page.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { listarConversaciones, suscribirseAConversaciones, type ConversacionConVinculo } from '@/lib/data/whatsapp'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import { SkeletonPage, SkeletonTable } from '@/components/Skeleton'
import { AvisoConexion } from './AvisoConexion'
import { ChatPanel } from './ChatPanel'
import { ListaConversaciones } from './ListaConversaciones'

export default function WhatsappPage() {
  const esAdmin = useEsAdministrador()
  const [conversaciones, setConversaciones] = useState<ConversacionConVinculo[] | null>(null)
  const [seleccionada, setSeleccionada] = useState<string | null>(null)

  const cargar = useCallback(() => {
    listarConversaciones()
      .then(setConversaciones)
      .catch(() => setConversaciones([]))
  }, [])

  useEffect(() => {
    cargar()
    return suscribirseAConversaciones(cargar)
  }, [cargar])

  if (conversaciones === null) {
    return (
      <SkeletonPage>
        <SkeletonTable filas={6} columnas={2} />
      </SkeletonPage>
    )
  }

  const actual = conversaciones.find((c) => c.id === seleccionada) ?? null

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-5 sm:p-8">
      <div className="rise flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Operación</p>
          <h1 className="mt-1 text-[27px] text-ink">WhatsApp</h1>
        </div>
        {esAdmin && (
          <div className="flex gap-3 text-xs font-semibold text-accent">
            <Link href="/whatsapp/conexion" className="hover:underline">
              Conexión
            </Link>
            <Link href="/whatsapp/automaticos" className="hover:underline">
              Respuestas automáticas
            </Link>
          </div>
        )}
      </div>

      <AvisoConexion />

      <div className="card rise grid min-h-[60vh] overflow-hidden md:grid-cols-[320px_1fr]">
        <div className={`overflow-y-auto border-line md:border-r ${actual ? 'hidden md:block' : ''}`}>
          <ListaConversaciones conversaciones={conversaciones} seleccionada={seleccionada} onSeleccionar={setSeleccionada} />
        </div>
        <div className={actual ? '' : 'hidden md:block'}>
          {actual ? (
            <>
              <button
                type="button"
                onClick={() => setSeleccionada(null)}
                className="px-4 pt-3 text-xs text-ink-faint underline md:hidden"
              >
                ← Volver a la lista
              </button>
              <ChatPanel key={actual.id} conversacion={actual} onCambio={cargar} />
            </>
          ) : (
            <p className="p-8 text-sm text-ink-faint">Elegí una conversación para empezar.</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Ítem en el menú**

En `components/Sidebar.tsx`, agregar el ícono junto a los demás (después de `IconUsuarios`):

```tsx
function IconWhatsapp() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="1.6">
      <path d="M3.5 16.5 4.7 13A6.5 6.5 0 1 1 7 15.3l-3.5 1.2Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.8 8.2c.3 1.6 1.9 3.2 4 4l1-1-1.4-.9-.7.5a3.5 3.5 0 0 1-1.4-1.4l.5-.7-.9-1.4-1.1 1.9Z" strokeLinejoin="round" />
    </svg>
  )
}
```

y en el grupo `Operación` de `GRUPOS`, después de Comparador:

```tsx
      { href: '/whatsapp', label: 'WhatsApp', Icono: IconWhatsapp },
```

- [ ] **Step 7: Verificar en el navegador**

Run: `npm run typecheck && npm run lint`
Luego `preview_start` del servidor de desarrollo, iniciar sesión y abrir `/whatsapp`.
Expected: la pantalla carga sin errores en consola (`read_console_messages`); muestra el aviso de WhatsApp desconectado si el gateway no está configurado; el menú tiene el ítem "WhatsApp". Con un mensaje de prueba enviado al webhook (Task 6, con el secreto configurado en `.env.local`) aparece la conversación en la lista sin recargar.

- [ ] **Step 8: Verificación completa y commit**

Run: `npm run check`
Expected: typecheck, lint, knip, tests y build en verde. Si `knip` marca un export sin uso, borrarlo o conectarlo antes de seguir.

```bash
git add "app/(app)/whatsapp" components/Sidebar.tsx
git commit -m "feat: bandeja de WhatsApp con chat, vínculos y aviso de conexión"
```

---

### Task 10: Pantalla de conexión (administrador)

**Files:**
- Create: `app/(app)/whatsapp/conexion/page.tsx`

**Interfaces:**
- Consumes: `GET /api/whatsapp/conexion?qr=1` (Task 8), `useEsAdministrador`.

- [ ] **Step 1: Página**

```tsx
// app/(app)/whatsapp/conexion/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'

export default function ConexionWhatsappPage() {
  const esAdmin = useEsAdministrador()
  const [estado, setEstado] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (esAdmin !== true) return
    let activo = true
    const consultar = () =>
      fetch('/api/whatsapp/conexion?qr=1')
        .then((r) => r.json())
        .then((d) => {
          if (!activo) return
          setEstado(d.estado)
          setQr(d.qr ?? null)
          setError(false)
        })
        .catch(() => activo && setError(true))
    consultar()
    // El QR de WhatsApp vence cada pocos segundos: se vuelve a pedir hasta que quede vinculado.
    const timer = setInterval(consultar, 5000)
    return () => {
      activo = false
      clearInterval(timer)
    }
  }, [esAdmin])

  if (esAdmin === null) return null
  if (esAdmin === false) {
    return <p className="p-8 text-sm text-negative">Acceso restringido — contactá a un administrador.</p>
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-5 sm:p-8">
      <div className="rise">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">WhatsApp</p>
        <h1 className="mt-1 text-[27px] text-ink">Conexión</h1>
      </div>

      <div className="card rise flex flex-col items-center gap-4 p-6 text-center">
        {error && <p className="text-sm text-negative">No se pudo consultar el estado. Reintentando…</p>}
        {estado === 'abierta' && (
          <p className="text-sm text-ink">El número está vinculado y funcionando.</p>
        )}
        {estado !== 'abierta' && qr && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Código QR para vincular WhatsApp" className="h-64 w-64" />
            <p className="text-sm text-ink-soft">
              En el celular del negocio: WhatsApp → Dispositivos vinculados → Vincular un dispositivo, y escaneá este código.
            </p>
          </>
        )}
        {estado !== 'abierta' && !qr && !error && (
          <p className="text-sm text-ink-faint">Esperando el código del gateway…</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar**

Run: `npm run typecheck && npm run lint`
Con el gateway de prueba (Task 1) apuntado desde `.env.local`, abrir `/whatsapp/conexion` como administrador.
Expected: se ve el QR y se renueva; al escanearlo pasa a "El número está vinculado y funcionando". Como empleado, muestra "Acceso restringido".

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/whatsapp/conexion/page.tsx"
git commit -m "feat: pantalla para vincular el número de WhatsApp por QR"
```

---

### Task 11: Mensajes automáticos

**Files:**
- Create: `lib/whatsapp/automaticos.ts`
- Test: `lib/whatsapp/automaticos.test.ts`
- Create: `lib/whatsapp/automaticosServidor.ts`
- Modify: `app/api/whatsapp/webhook/[secreto]/route.ts`
- Modify: `lib/data/whatsapp.ts`
- Create: `app/(app)/whatsapp/automaticos/page.tsx`

**Interfaces:**
- Consumes: `RegistroMensaje`, `ResultadoRegistro` (Task 6), `enviarTexto`, `ConfigGateway` (Task 5), `ReglaWhatsapp`, `TipoReglaWhatsapp` (Task 2).
- Produces:
  - `elegirRegla(reglas: ReglaWhatsapp[], ctx: ContextoAutomatico): ReglaWhatsapp | null`, `estaAbierto(regla, ahora): boolean`, `pausaAleatoriaMs(azar?): number`, `ENFRIAMIENTO_MS`
  - `DepsAutomaticos` y `responderAutomatico(entrada, deps): Promise<TipoReglaWhatsapp | null>`
  - `depsAutomaticosReales(admin, cfg): DepsAutomaticos`
  - En `lib/data/whatsapp.ts`: `obtenerAutomaticos()`, `guardarInterruptor(activo)`, `guardarRegla(tipo, cambios)`.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
// lib/whatsapp/automaticos.test.ts
import { describe, it, expect, vi } from 'vitest'
import {
  elegirRegla,
  estaAbierto,
  pausaAleatoriaMs,
  responderAutomatico,
  type DepsAutomaticos,
} from './automaticos'
import type { ReglaWhatsapp } from '@/types/database'

const saludo: ReglaWhatsapp = { tipo: 'saludo_inicial', activa: true, texto: 'Hola!', abre: null, cierra: null, dias: [1, 2, 3, 4, 5, 6] }
const fuera: ReglaWhatsapp = { tipo: 'fuera_de_horario', activa: true, texto: 'Cerrado', abre: '09:00', cierra: '19:00', dias: [1, 2, 3, 4, 5, 6] }

// Buenos Aires es UTC-3 todo el año. 2026-11-03 es martes.
const martes12h = new Date('2026-11-03T15:00:00Z')
const martes22h = new Date('2026-11-04T01:00:00Z')
const domingo12h = new Date('2026-11-08T15:00:00Z')

const base = { interruptor: true, primeraVez: false, esProveedor: false, ultimoEnvio: {} }

describe('estaAbierto', () => {
  it('respeta horario y días en hora argentina', () => {
    expect(estaAbierto(fuera, martes12h)).toBe(true)
    expect(estaAbierto(fuera, martes22h)).toBe(false)
    expect(estaAbierto(fuera, domingo12h)).toBe(false)
  })
  it('sin horario cargado nunca está "cerrado"', () => {
    expect(estaAbierto({ ...fuera, abre: null, cierra: null }, martes22h)).toBe(true)
  })
})

describe('elegirRegla', () => {
  it('fuera de horario responde aunque no sea la primera vez', () => {
    expect(elegirRegla([saludo, fuera], { ...base, ahora: martes22h })?.tipo).toBe('fuera_de_horario')
  })
  it('si es la primera vez y estamos fuera de horario, manda solo fuera de horario', () => {
    expect(elegirRegla([saludo, fuera], { ...base, ahora: martes22h, primeraVez: true })?.tipo).toBe('fuera_de_horario')
  })
  it('en horario, saluda solo la primera vez', () => {
    expect(elegirRegla([saludo, fuera], { ...base, ahora: martes12h, primeraVez: true })?.tipo).toBe('saludo_inicial')
    expect(elegirRegla([saludo, fuera], { ...base, ahora: martes12h })).toBeNull()
  })
  it('no responde con el interruptor apagado ni a proveedores', () => {
    expect(elegirRegla([saludo, fuera], { ...base, ahora: martes22h, interruptor: false })).toBeNull()
    expect(elegirRegla([saludo, fuera], { ...base, ahora: martes22h, esProveedor: true })).toBeNull()
  })
  it('ignora reglas inactivas', () => {
    expect(elegirRegla([{ ...fuera, activa: false }], { ...base, ahora: martes22h })).toBeNull()
  })
  it('no repite la misma regla dentro de las 24 h', () => {
    const hace2h = new Date(martes22h.getTime() - 2 * 3600_000)
    const hace25h = new Date(martes22h.getTime() - 25 * 3600_000)
    expect(elegirRegla([fuera], { ...base, ahora: martes22h, ultimoEnvio: { fuera_de_horario: hace2h } })).toBeNull()
    expect(elegirRegla([fuera], { ...base, ahora: martes22h, ultimoEnvio: { fuera_de_horario: hace25h } })?.tipo).toBe('fuera_de_horario')
  })
})

describe('pausaAleatoriaMs', () => {
  it('queda entre 2 y 6 segundos', () => {
    expect(pausaAleatoriaMs(() => 0)).toBe(2000)
    expect(pausaAleatoriaMs(() => 0.999999)).toBe(6000)
  })
})

function deps(sobre: Partial<DepsAutomaticos> = {}): DepsAutomaticos {
  return {
    cargarConfig: vi.fn().mockResolvedValue({ interruptor: true, reglas: [saludo, fuera] }),
    ultimosEnvios: vi.fn().mockResolvedValue({}),
    enviarTexto: vi.fn().mockResolvedValue({ waMessageId: 'WA9' }),
    registrar: vi.fn().mockResolvedValue({
      conversacionId: 'c1', mensajeId: 'm1', esNuevo: true, primeraVez: false, proveedorId: null, clienteId: null,
    }),
    marcarMensaje: vi.fn().mockResolvedValue(undefined),
    dormir: vi.fn().mockResolvedValue(undefined),
    ahora: () => martes22h,
    ...sobre,
  }
}
const entrada = { telefono: '5491112345678', clave: '12345678', conversacionId: 'c1', primeraVez: true, esProveedor: false }

describe('responderAutomatico', () => {
  it('registra primero, espera, envía y marca como enviado', async () => {
    const d = deps()
    const r = await responderAutomatico(entrada, d)
    expect(r).toBe('fuera_de_horario')
    expect(d.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ origen: 'automatico', estado: 'pendiente', reglaTipo: 'fuera_de_horario', texto: 'Cerrado' })
    )
    expect(d.dormir).toHaveBeenCalled()
    expect(d.enviarTexto).toHaveBeenCalledWith('5491112345678', 'Cerrado')
    expect(d.marcarMensaje).toHaveBeenCalledWith('m1', { estado: 'enviado', waMessageId: 'WA9' })
  })
  it('no hace nada si ninguna regla corresponde', async () => {
    const d = deps({ ahora: () => martes12h })
    expect(await responderAutomatico({ ...entrada, primeraVez: false }, d)).toBeNull()
    expect(d.registrar).not.toHaveBeenCalled()
    expect(d.enviarTexto).not.toHaveBeenCalled()
  })
  it('si el gateway falla, marca el mensaje con error y no lanza', async () => {
    const d = deps({ enviarTexto: vi.fn().mockRejectedValue(new Error('caído')) })
    expect(await responderAutomatico(entrada, d)).toBeNull()
    expect(d.marcarMensaje).toHaveBeenCalledWith('m1', { estado: 'error', waMessageId: null })
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run lib/whatsapp/automaticos.test.ts`
Expected: FAIL, "Failed to resolve import './automaticos'".

- [ ] **Step 3: Implementar `automaticos.ts`**

```ts
// lib/whatsapp/automaticos.ts
import type { ReglaWhatsapp, TipoReglaWhatsapp } from '@/types/database'
import type { RegistroMensaje, ResultadoRegistro } from './registro'

const ZONA = 'America/Argentina/Buenos_Aires'
const DIAS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export const ENFRIAMIENTO_MS = 24 * 60 * 60 * 1000

function partesLocales(ahora: Date): { dia: number; minutos: number } {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ahora)
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? ''
  return { dia: DIAS[valor('weekday')] ?? 0, minutos: Number(valor('hour')) * 60 + Number(valor('minute')) }
}

function aMinutos(hora: string | null): number | null {
  const m = hora?.match(/^(\d{2}):(\d{2})/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** Con horario cargado, dice si el negocio está abierto en este momento (hora de Buenos Aires). */
export function estaAbierto(regla: ReglaWhatsapp, ahora: Date): boolean {
  const abre = aMinutos(regla.abre)
  const cierra = aMinutos(regla.cierra)
  if (abre === null || cierra === null) return true
  const { dia, minutos } = partesLocales(ahora)
  return regla.dias.includes(dia) && minutos >= abre && minutos < cierra
}

export interface ContextoAutomatico {
  ahora: Date
  interruptor: boolean
  primeraVez: boolean
  esProveedor: boolean
  ultimoEnvio: Partial<Record<TipoReglaWhatsapp, Date>>
}

export function elegirRegla(reglas: ReglaWhatsapp[], ctx: ContextoAutomatico): ReglaWhatsapp | null {
  if (!ctx.interruptor || ctx.esProveedor) return null
  const disponible = (tipo: TipoReglaWhatsapp) =>
    reglas.find((r) => {
      if (r.tipo !== tipo || !r.activa) return false
      const ultimo = ctx.ultimoEnvio[tipo]
      return !ultimo || ctx.ahora.getTime() - ultimo.getTime() >= ENFRIAMIENTO_MS
    })

  const fuera = disponible('fuera_de_horario')
  if (fuera && !estaAbierto(fuera, ctx.ahora)) return fuera
  return ctx.primeraVez ? (disponible('saludo_inicial') ?? null) : null
}

/** Pausa de 2 a 6 segundos para que la respuesta no salga con aspecto de robot. */
export function pausaAleatoriaMs(azar: () => number = Math.random): number {
  return 2000 + Math.floor(azar() * 4001)
}

export interface DepsAutomaticos {
  cargarConfig(): Promise<{ interruptor: boolean; reglas: ReglaWhatsapp[] }>
  ultimosEnvios(conversacionId: string): Promise<Partial<Record<TipoReglaWhatsapp, Date>>>
  enviarTexto(numero: string, texto: string): Promise<{ waMessageId: string | null }>
  registrar(m: RegistroMensaje): Promise<ResultadoRegistro>
  marcarMensaje(
    mensajeId: string,
    cambios: { estado: 'enviado' | 'error'; waMessageId: string | null }
  ): Promise<void>
  dormir(ms: number): Promise<void>
  ahora(): Date
}

export interface EntradaAutomatica {
  telefono: string
  clave: string
  conversacionId: string
  primeraVez: boolean
  esProveedor: boolean
}

/**
 * Responde a un mensaje entrante si alguna regla corresponde. Guarda el mensaje como "pendiente"
 * antes de esperar, así otro aviso que llegue en esos segundos ya ve el enfriamiento.
 * Nunca lanza: una respuesta automática fallida no debe afectar al resto.
 */
export async function responderAutomatico(
  entrada: EntradaAutomatica,
  deps: DepsAutomaticos
): Promise<TipoReglaWhatsapp | null> {
  const { interruptor, reglas } = await deps.cargarConfig()
  const regla = elegirRegla(reglas, {
    ahora: deps.ahora(),
    interruptor,
    primeraVez: entrada.primeraVez,
    esProveedor: entrada.esProveedor,
    ultimoEnvio: await deps.ultimosEnvios(entrada.conversacionId),
  })
  if (!regla) return null

  const guardado = await deps.registrar({
    telefono: entrada.telefono,
    clave: entrada.clave,
    nombre: null,
    direccion: 'saliente',
    texto: regla.texto,
    origen: 'automatico',
    estado: 'pendiente',
    waMessageId: null,
    enviadoPor: null,
    reglaTipo: regla.tipo,
    proveedorId: null,
  })

  try {
    await deps.dormir(pausaAleatoriaMs())
    const { waMessageId } = await deps.enviarTexto(entrada.telefono, regla.texto)
    await deps.marcarMensaje(guardado.mensajeId, { estado: 'enviado', waMessageId })
    return regla.tipo
  } catch (err) {
    console.error('Falló la respuesta automática de WhatsApp:', err)
    await deps.marcarMensaje(guardado.mensajeId, { estado: 'error', waMessageId: null }).catch(() => {})
    return null
  }
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run lib/whatsapp/automaticos.test.ts`
Expected: PASS.

- [ ] **Step 5: Conexión con Supabase y el gateway**

```ts
// lib/whatsapp/automaticosServidor.ts
import type { createAdminClient } from '@/lib/supabase/admin'
import type { ReglaWhatsapp, TipoReglaWhatsapp } from '@/types/database'
import type { DepsAutomaticos } from './automaticos'
import { enviarTexto, type ConfigGateway } from './gateway'
import { registrarMensaje } from './registro'

export function depsAutomaticosReales(
  admin: ReturnType<typeof createAdminClient>,
  cfg: ConfigGateway
): DepsAutomaticos {
  return {
    async cargarConfig() {
      const [config, reglas] = await Promise.all([
        admin.from('whatsapp_config').select('automaticos_activos').maybeSingle(),
        admin.from('whatsapp_reglas').select('*'),
      ])
      return {
        interruptor: (config.data as { automaticos_activos: boolean } | null)?.automaticos_activos ?? false,
        reglas: (reglas.data ?? []) as ReglaWhatsapp[],
      }
    },
    async ultimosEnvios(conversacionId) {
      const { data } = await admin
        .from('whatsapp_mensajes')
        .select('regla_tipo, creado_en')
        .eq('conversacion_id', conversacionId)
        .eq('origen', 'automatico')
        .neq('estado', 'error')
        .order('creado_en', { ascending: false })
        .limit(10)
      const ultimos: Partial<Record<TipoReglaWhatsapp, Date>> = {}
      for (const fila of (data ?? []) as { regla_tipo: TipoReglaWhatsapp | null; creado_en: string }[]) {
        if (fila.regla_tipo && !ultimos[fila.regla_tipo]) ultimos[fila.regla_tipo] = new Date(fila.creado_en)
      }
      return ultimos
    },
    enviarTexto: (numero, texto) => enviarTexto(cfg, numero, texto),
    registrar: (m) => registrarMensaje(admin, m),
    async marcarMensaje(id, cambios) {
      const { error } = await admin
        .from('whatsapp_mensajes')
        .update({ estado: cambios.estado, wa_message_id: cambios.waMessageId } as never)
        .eq('id', id)
      if (error) throw error
    },
    dormir: (ms) => new Promise((resolver) => setTimeout(resolver, ms)),
    ahora: () => new Date(),
  }
}
```

- [ ] **Step 6: Enganchar el webhook**

En `app/api/whatsapp/webhook/[secreto]/route.ts`, reemplazar las importaciones y el bloque `try`:

```ts
import { after, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { responderAutomatico } from '@/lib/whatsapp/automaticos'
import { depsAutomaticosReales } from '@/lib/whatsapp/automaticosServidor'
import { leerConfigGateway } from '@/lib/whatsapp/gateway'
import { registrarMensaje } from '@/lib/whatsapp/registro'
import { procesarWebhook, secretoValido } from '@/lib/whatsapp/webhook'
```

```ts
  const body = await request.json().catch(() => null)
  const admin = createAdminClient()
  try {
    const procesado = await procesarWebhook(body, (m) => registrarMensaje(admin, m))
    const cfg = leerConfigGateway()
    // Solo se responde a mensajes ajenos y nuevos; la pausa corre después de contestarle al gateway.
    if (procesado && cfg && !procesado.propio && procesado.resultado.esNuevo) {
      after(() =>
        responderAutomatico(
          {
            telefono: procesado.telefono,
            clave: procesado.clave,
            conversacionId: procesado.resultado.conversacionId,
            primeraVez: procesado.resultado.primeraVez,
            esProveedor: procesado.resultado.proveedorId !== null,
          },
          depsAutomaticosReales(admin, cfg)
        ).catch((err) => console.error('Falló la respuesta automática:', err))
      )
    }
  } catch (err) {
```
(el `catch` y el resto de la función quedan como estaban).

- [ ] **Step 7: Lecturas y escrituras de las reglas**

Agregar a `lib/data/whatsapp.ts` (y sumar `ConfigWhatsapp`, `ReglaWhatsapp`, `TipoReglaWhatsapp` al `import type` del principio):

```ts
export async function obtenerAutomaticos(): Promise<{ interruptor: boolean; reglas: ReglaWhatsapp[] }> {
  const supabase = createClient()
  const [config, reglas] = await Promise.all([
    supabase.from('whatsapp_config').select('*').maybeSingle(),
    supabase.from('whatsapp_reglas').select('*').order('tipo'),
  ])
  if (config.error) throw config.error
  if (reglas.error) throw reglas.error
  return {
    interruptor: (config.data as ConfigWhatsapp | null)?.automaticos_activos ?? false,
    reglas: reglas.data as ReglaWhatsapp[],
  }
}

export async function guardarInterruptor(activo: boolean): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('whatsapp_config')
    .update({ automaticos_activos: activo } as never)
    .eq('id', true)
  if (error) throw error
}

export async function guardarRegla(
  tipo: TipoReglaWhatsapp,
  cambios: Partial<Pick<ReglaWhatsapp, 'activa' | 'texto' | 'abre' | 'cierra' | 'dias'>>
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('whatsapp_reglas').update(cambios as never).eq('tipo', tipo)
  if (error) throw error
}
```

- [ ] **Step 8: Pantalla del administrador**

```tsx
// app/(app)/whatsapp/automaticos/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { guardarInterruptor, guardarRegla, obtenerAutomaticos } from '@/lib/data/whatsapp'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import type { ReglaWhatsapp, TipoReglaWhatsapp } from '@/types/database'

const TITULOS: Record<TipoReglaWhatsapp, string> = {
  saludo_inicial: 'Saludo inicial',
  fuera_de_horario: 'Fuera de horario',
}
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function ReglaForm({ regla }: { regla: ReglaWhatsapp }) {
  const [valores, setValores] = useState(regla)
  const [estado, setEstado] = useState<'' | 'guardando' | 'guardado' | 'error'>('')
  const conHorario = regla.tipo === 'fuera_de_horario'

  async function guardar() {
    setEstado('guardando')
    try {
      await guardarRegla(regla.tipo, {
        activa: valores.activa,
        texto: valores.texto,
        abre: conHorario ? valores.abre : null,
        cierra: conHorario ? valores.cierra : null,
        dias: valores.dias,
      })
      setEstado('guardado')
    } catch {
      setEstado('error')
    }
  }

  return (
    <div className="card rise flex flex-col gap-3 p-5">
      <label className="flex items-center justify-between text-sm font-semibold text-ink">
        {TITULOS[regla.tipo]}
        <input
          type="checkbox"
          checked={valores.activa}
          onChange={(e) => setValores({ ...valores, activa: e.target.checked })}
        />
      </label>
      <textarea
        value={valores.texto}
        onChange={(e) => setValores({ ...valores, texto: e.target.value })}
        rows={3}
        maxLength={1000}
        className="rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none focus:border-accent"
      />
      {conHorario && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-soft">
          <label>
            Abre{' '}
            <input
              type="time"
              value={valores.abre?.slice(0, 5) ?? ''}
              onChange={(e) => setValores({ ...valores, abre: e.target.value || null })}
              className="rounded border border-line bg-surface p-1"
            />
          </label>
          <label>
            Cierra{' '}
            <input
              type="time"
              value={valores.cierra?.slice(0, 5) ?? ''}
              onChange={(e) => setValores({ ...valores, cierra: e.target.value || null })}
              className="rounded border border-line bg-surface p-1"
            />
          </label>
          {DIAS.map((nombre, i) => (
            <label key={nombre} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={valores.dias.includes(i)}
                onChange={(e) =>
                  setValores({
                    ...valores,
                    dias: e.target.checked ? [...valores.dias, i].sort() : valores.dias.filter((d) => d !== i),
                  })
                }
              />
              {nombre}
            </label>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button type="button" onClick={guardar} disabled={estado === 'guardando'} className="pill-btn">
          Guardar
        </button>
        {estado === 'guardado' && <span className="text-xs text-ink-soft">Guardado</span>}
        {estado === 'error' && <span className="text-xs text-negative">No se pudo guardar. Intentá de nuevo.</span>}
      </div>
    </div>
  )
}

export default function AutomaticosPage() {
  const esAdmin = useEsAdministrador()
  const [datos, setDatos] = useState<{ interruptor: boolean; reglas: ReglaWhatsapp[] } | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (esAdmin !== true) return
    obtenerAutomaticos().then(setDatos).catch(() => setError(true))
  }, [esAdmin])

  if (esAdmin === null) return null
  if (esAdmin === false) {
    return <p className="p-8 text-sm text-negative">Acceso restringido — contactá a un administrador.</p>
  }
  if (error) return <p className="p-8 text-sm text-negative">No se pudieron cargar las respuestas automáticas.</p>
  if (!datos) return null

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-5 sm:p-8">
      <div className="rise">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">WhatsApp</p>
        <h1 className="mt-1 text-[27px] text-ink">Respuestas automáticas</h1>
        <p className="mt-2 text-xs text-ink-faint">
          Solo se responde a quien escribe primero, una vez cada 24 horas por regla y nunca a proveedores.
        </p>
      </div>

      <label className="card rise flex items-center justify-between p-5 text-sm font-semibold text-ink">
        Respuestas automáticas activadas
        <input
          type="checkbox"
          defaultChecked={datos.interruptor}
          onChange={(e) => guardarInterruptor(e.target.checked).catch(() => setError(true))}
        />
      </label>

      {datos.reglas.map((regla) => (
        <ReglaForm key={regla.tipo} regla={regla} />
      ))}
    </div>
  )
}
```

- [ ] **Step 9: Verificar**

Run: `npm run typecheck && npm run lint && npx vitest run lib/whatsapp`
Luego en el navegador, como administrador: `/whatsapp/automaticos` carga, el interruptor y el guardado funcionan (verificar con `select` que `whatsapp_config` y `whatsapp_reglas` cambian), y como empleado muestra "Acceso restringido".
Prueba de punta a punta con el gateway de prueba: activar el interruptor y la regla de saludo, escribir desde otro teléfono y comprobar que llega UNA sola respuesta tras 2–6 s; escribir de nuevo y comprobar que no llega otra.

- [ ] **Step 10: Verificación completa y commit**

Run: `npm run check`
Expected: todo en verde.

```bash
git add lib/whatsapp/automaticos.ts lib/whatsapp/automaticos.test.ts lib/whatsapp/automaticosServidor.ts "app/api/whatsapp/webhook/[secreto]/route.ts" lib/data/whatsapp.ts "app/(app)/whatsapp/automaticos/page.tsx"
git commit -m "feat: respuestas automáticas de WhatsApp con límites para cuidar el número"
```

---

### Task 12: Pedido a proveedor desde Reposición

**Files:**
- Create: `lib/whatsapp/pedido.ts`
- Test: `lib/whatsapp/pedido.test.ts`
- Create: `app/(app)/reposicion/ModalPedidoWhatsapp.tsx`
- Modify: `app/(app)/reposicion/page.tsx`

**Interfaces:**
- Consumes: `numeroParaEnviar` (Task 3), `POST /api/whatsapp/enviar` con `{ origen: 'pedido', telefono, proveedorId, texto }` (Task 7), `PaqueteReposicion` y `calcularCantidad` de la página.
- Produces: `armarMensajePedido(proveedor: string, items: { nombre: string; cantidad: number }[]): string`.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
// lib/whatsapp/pedido.test.ts
import { describe, it, expect } from 'vitest'
import { armarMensajePedido } from './pedido'

describe('armarMensajePedido', () => {
  it('arma un saludo, una línea por producto y el cierre', () => {
    expect(
      armarMensajePedido('Distribuidora Sur', [
        { nombre: 'Alimento A 15kg', cantidad: 12 },
        { nombre: 'Piedras sanitarias', cantidad: 2.5 },
      ])
    ).toBe(
      [
        'Hola Distribuidora Sur! Te paso el pedido de Planeta Animal:',
        '',
        '- 12 x Alimento A 15kg',
        '- 2,5 x Piedras sanitarias',
        '',
        'Gracias!',
      ].join('\n')
    )
  })
  it('formatea miles con punto', () => {
    expect(armarMensajePedido('X', [{ nombre: 'Y', cantidad: 1200 }])).toContain('- 1.200 x Y')
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run lib/whatsapp/pedido.test.ts`
Expected: FAIL, "Failed to resolve import './pedido'".

- [ ] **Step 3: Implementar**

```ts
// lib/whatsapp/pedido.ts
export interface ItemPedido {
  nombre: string
  cantidad: number
}

/** Texto inicial del pedido a un proveedor. Después se edita a mano antes de enviarlo. */
export function armarMensajePedido(proveedor: string, items: ItemPedido[]): string {
  const lineas = items.map(
    (item) => `- ${item.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 2 })} x ${item.nombre}`
  )
  return [`Hola ${proveedor}! Te paso el pedido de Planeta Animal:`, '', ...lineas, '', 'Gracias!'].join('\n')
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run lib/whatsapp/pedido.test.ts`
Expected: PASS.

- [ ] **Step 5: Ventana del pedido**

```tsx
// app/(app)/reposicion/ModalPedidoWhatsapp.tsx
'use client'

import { useState } from 'react'
import type { Proveedor } from '@/types/database'

export function ModalPedidoWhatsapp({
  proveedor,
  mensajeInicial,
  onCerrar,
}: {
  proveedor: Proveedor
  mensajeInicial: string
  onCerrar: () => void
}) {
  const [texto, setTexto] = useState(mensajeInicial)
  const [estado, setEstado] = useState<'editando' | 'enviando' | 'enviado'>('editando')
  const [error, setError] = useState<string | null>(null)

  async function enviar() {
    setEstado('enviando')
    setError(null)
    const res = await fetch('/api/whatsapp/enviar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origen: 'pedido',
        telefono: proveedor.telefono,
        proveedorId: proveedor.id,
        texto,
      }),
    })
    const datos = await res.json().catch(() => ({}))
    if (res.ok) {
      setEstado('enviado')
    } else {
      setEstado('editando')
      setError(datos.error ?? 'No se pudo enviar el pedido.')
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="card flex w-full max-w-lg flex-col gap-3 p-5">
        <p className="text-sm font-semibold text-ink">Pedido por WhatsApp a {proveedor.nombre}</p>
        {estado === 'enviado' ? (
          <>
            <p className="text-sm text-ink-soft">Pedido enviado. Queda en el chat del proveedor.</p>
            <button type="button" onClick={onCerrar} className="pill-btn self-end">
              Cerrar
            </button>
          </>
        ) : (
          <>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={10}
              maxLength={4096}
              className="rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none focus:border-accent"
            />
            {error && <p className="text-xs text-negative">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onCerrar} className="px-3 text-sm text-ink-faint">
                Cancelar
              </button>
              <button
                type="button"
                onClick={enviar}
                disabled={estado === 'enviando' || !texto.trim()}
                className="pill-btn"
              >
                {estado === 'enviando' ? 'Enviando…' : 'Enviar pedido'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Botón en Reposición**

En `app/(app)/reposicion/page.tsx`:

1. Importaciones nuevas (junto a las existentes):

```tsx
import { armarMensajePedido } from '@/lib/whatsapp/pedido'
import { numeroParaEnviar } from '@/lib/whatsapp/telefono'
import { ModalPedidoWhatsapp } from './ModalPedidoWhatsapp'
```

2. Estado, **antes** del primer `if` con `return` (junto a los otros `useState`, para no romper el orden de los hooks):

```tsx
  const [pedido, setPedido] = useState<PaqueteReposicion | null>(null)
```

3. En el encabezado de cada paquete, reemplazar el `<button onClick={() => handleCrearCompra(paquete)} ...>` por:

```tsx
              <div className="flex flex-wrap items-center gap-2">
                {numeroParaEnviar(paquete.proveedor.telefono ?? '') ? (
                  <button onClick={() => setPedido(paquete)} className="pill-btn">
                    Pedir por WhatsApp
                  </button>
                ) : (
                  <Link
                    href={`/proveedores/${paquete.proveedor.id}`}
                    className="text-xs font-semibold text-accent hover:underline"
                  >
                    Cargar un celular para pedir por WhatsApp →
                  </Link>
                )}
                <button onClick={() => handleCrearCompra(paquete)} className="pill-btn">
                  Crear compra con {paquete.proveedor.nombre}
                </button>
              </div>
```

4. Antes del `</div>` final del componente, la ventana:

```tsx
      {pedido && (
        <ModalPedidoWhatsapp
          proveedor={pedido.proveedor}
          mensajeInicial={armarMensajePedido(
            pedido.proveedor.nombre,
            pedido.items.map((item) => ({
              nombre: item.producto.nombre,
              cantidad: calcularCantidad(item, cantidades),
            }))
          )}
          onCerrar={() => setPedido(null)}
        />
      )}
```

- [ ] **Step 7: Verificar**

Run: `npm run typecheck && npm run lint && npm test`
En el navegador como administrador, `/reposicion`: un proveedor con celular válido muestra "Pedir por WhatsApp"; uno sin teléfono muestra el enlace a cargarlo. Con el gateway de prueba, "Enviar pedido" manda el mensaje a un número propio y aparece en `/whatsapp` en el chat de ese proveedor, vinculado y con "· pedido".
Nota: el stock actual es provisorio, así que el contenido del pedido va a ser ruidoso hasta el inventario real; por eso el mensaje es editable y nunca sale solo.

- [ ] **Step 8: Verificación completa y commit**

Run: `npm run check`
Expected: todo en verde.

```bash
git add lib/whatsapp/pedido.ts lib/whatsapp/pedido.test.ts "app/(app)/reposicion"
git commit -m "feat: pedido a proveedor por WhatsApp desde Reposición"
```

---

### Task 13: Documentación, pruebas de navegador y puesta en marcha

**Files:**
- Modify: `docs/WHATSAPP.md`
- Modify: `docs/PRUEBAS.md`
- Modify: `docs/ARQUITECTURA.md`
- Create: `e2e/whatsapp.spec.ts`
- Modify: `e2e/con-sesion.spec.ts`

- [ ] **Step 1: Pruebas de navegador sin sesión**

```ts
// e2e/whatsapp.spec.ts
import { expect, test } from '@playwright/test'

test.describe('WhatsApp sin sesión', () => {
  test('el webhook rechaza un secreto incorrecto sin mandar al login', async ({ request }) => {
    const res = await request.post('/api/whatsapp/webhook/un-secreto-incorrecto-que-no-existe', {
      data: {},
      maxRedirects: 0,
    })
    expect(res.status()).toBe(401)
  })

  test('enviar y conexión no responden sin sesión', async ({ request }) => {
    for (const [metodo, ruta] of [
      ['post', '/api/whatsapp/enviar'],
      ['get', '/api/whatsapp/conexion'],
    ] as const) {
      const res = await request[metodo](ruta, { maxRedirects: 0 })
      expect([307, 308, 401]).toContain(res.status())
    }
  })

  test('la pantalla /whatsapp redirige al login', async ({ page }) => {
    await page.goto('/whatsapp')
    await expect(page).toHaveURL(/\/login/)
  })
})
```

- [ ] **Step 2: Sumar la pantalla al recorrido con sesión**

En `e2e/con-sesion.spec.ts`, agregar `'/whatsapp'` a la lista de rutas:

```ts
  for (const ruta of ['/', '/productos', '/stock', '/compras', '/ventas', '/proveedores', '/gastos', '/reportes', '/whatsapp']) {
```

- [ ] **Step 3: Documentar la operación**

Completar `docs/WHATSAPP.md` (conservando la sección "Verificado" de la Task 1) con:

```markdown
## Cómo funciona

El número del negocio se vincula por QR a un gateway Evolution API que corre en un servidor propio
(no en Vercel, porque necesita una conexión permanente). El gateway avisa por webhook a
`/api/whatsapp/webhook/<secreto>`; el sistema guarda los mensajes en Supabase y la pantalla
`/whatsapp` los muestra en tiempo real. Los envíos salen siempre por `/api/whatsapp/enviar`.

## Variables de entorno (Vercel y `.env.local`)

| Variable | Qué es |
|---|---|
| `WHATSAPP_GATEWAY_URL` | URL pública del gateway, sin barra final |
| `WHATSAPP_GATEWAY_API_KEY` | `AUTHENTICATION_API_KEY` del gateway |
| `WHATSAPP_INSTANCE` | Nombre de la instancia (ej. `planeta`) |
| `WHATSAPP_WEBHOOK_SECRET` | Texto largo y aleatorio (32+ caracteres) que va en la URL del webhook |

## Puesta en marcha

1. Desplegar Evolution API (con su Postgres y Redis) en el servidor elegido, con `AUTHENTICATION_API_KEY`.
2. Crear la instancia y vincular el celular desde `/whatsapp/conexion` (administrador).
3. En el Manager del gateway, configurar el webhook en
   `https://sistema.planetaanimal.com.ar/api/whatsapp/webhook/<WHATSAPP_WEBHOOK_SECRET>`
   con el evento `MESSAGES_UPSERT`.
4. Cargar las cuatro variables en Vercel y volver a desplegar.
5. Probar: escribir al número desde otro teléfono; el chat debe aparecer en `/whatsapp`.
6. Recién después, activar las respuestas automáticas desde `/whatsapp/automaticos`.

## Mantenimiento

- **Rotar el secreto del webhook:** cambiar `WHATSAPP_WEBHOOK_SECRET` en Vercel y la URL en el Manager del gateway. El secreto viaja en la URL y puede quedar en los registros de Vercel.
- **Cambiar de número:** cerrar la sesión desde el Manager del gateway y volver a escanear en `/whatsapp/conexion`.
- **Si el aviso rojo de desconexión no se va:** revisar que el celular tenga internet y que el gateway esté corriendo.

## Límites de la v1

Solo texto (adjuntos aparecen como "📷 Imagen", "🎤 Audio", etc.), un solo número, sin difusiones
masivas y sin estados "entregado/leído" (solo enviado o con error).

## Riesgo

Vincular por QR no es la API oficial de Meta: el número puede ser bloqueado. Por eso las respuestas
automáticas están limitadas y no hay envíos masivos.
```

En `docs/PRUEBAS.md`, agregar a la sección "Sin sesión": una línea "El webhook de WhatsApp rechaza un secreto incorrecto y las APIs de envío y conexión no responden sin sesión." Y una nota: "Las pruebas de RLS de WhatsApp están en `supabase/tests/rls.sql` (se corren con `supabase db query --linked -f supabase/tests/rls.sql`)."

En `docs/ARQUITECTURA.md`, agregar una sección corta "WhatsApp" que apunte a `docs/WHATSAPP.md` y mencione las tablas `whatsapp_*` y las rutas `/api/whatsapp/*`.

- [ ] **Step 4: Verificación completa**

Run: `npm run check && npm run e2e`
Expected: todo en verde (las pruebas con sesión se saltean si faltan `E2E_EMAIL`/`E2E_PASSWORD`).

- [ ] **Step 5: Verificación manual de punta a punta (con el usuario)**

Con el gateway real desplegado, las variables cargadas y el webhook apuntando:

1. Un mensaje desde otro teléfono aparece en `/whatsapp` sin recargar y con el contador de no leídos.
2. Responder desde la pantalla llega al otro teléfono; responder desde el celular vinculado aparece en el chat.
3. Mandar un pedido desde Reposición a un proveedor de prueba.
4. Con el interruptor de automáticos encendido, comprobar que llega una sola respuesta automática y que no se repite dentro de las 24 h.
5. Apagar el gateway y comprobar el aviso rojo y que un envío queda con "No se envió · Reintentar".

- [ ] **Step 6: Commit**

```bash
git add docs/WHATSAPP.md docs/PRUEBAS.md docs/ARQUITECTURA.md e2e/whatsapp.spec.ts e2e/con-sesion.spec.ts
git commit -m "docs: operación de WhatsApp y pruebas de navegador"
```
