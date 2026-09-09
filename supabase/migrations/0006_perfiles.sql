-- Perfiles de usuario: nombre visible y foto, para personalizar la UI
-- (sidebar, saludo del dashboard). Cada usuario gestiona únicamente su
-- propio perfil — no hay panel de administración de usuarios todavía.

create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table perfiles enable row level security;

create policy "usuarios ven su propio perfil"
  on perfiles for select
  using (auth.uid() = id);

create policy "usuarios crean su propio perfil"
  on perfiles for insert
  with check (auth.uid() = id);

create policy "usuarios actualizan su propio perfil"
  on perfiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Storage: bucket público (en lectura) para fotos de perfil. Cada usuario
-- solo puede escribir dentro de su propia carpeta <user_id>/.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true);

create policy "usuarios suben su propio avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "usuarios actualizan su propio avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "cualquiera puede ver los avatares"
  on storage.objects for select
  using (bucket_id = 'avatars');
