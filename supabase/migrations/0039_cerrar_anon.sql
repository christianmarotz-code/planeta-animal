-- 0039: defensa en profundidad (auditoría 2026-10-31). Sin cambios de comportamiento para el uso normal.
--
-- La app nunca usa el rol anon contra la base: todo pasa con sesión (authenticated) o con la service_role.
-- Hasta ahora lo único que frenaba a anon era RLS; esto le quita también los permisos de tabla,
-- así que una policy mal escrita en el futuro no puede abrir datos a visitantes sin sesión.
begin;

-- 1. Permisos actuales
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- 2. Permisos por defecto de lo que se cree de acá en adelante (por ejemplo, tablas nuevas)
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- 3. Policies de Storage: solo para usuarios con sesión (antes estaban declaradas para `public`;
--    ya frenaban a anon por auth.uid(), esto lo hace explícito).
alter policy "admins suben adjuntos de facturas" on storage.objects to authenticated;
alter policy "admins ven adjuntos de facturas" on storage.objects to authenticated;
alter policy "usuarios suben su propio avatar" on storage.objects to authenticated;
alter policy "usuarios actualizan su propio avatar" on storage.objects to authenticated;

commit;
