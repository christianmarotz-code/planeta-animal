-- La política de UPDATE de perfiles (migración 0006) es agnóstica de
-- columna: permite a cualquier usuario escribir CUALQUIER campo de su
-- propia fila, incluida la columna `rol` agregada en 0007. Eso deja a
-- cualquier empleado auto-promoverse a administrador con la clave anon
-- pública, sin pasar por la verificación del servidor en
-- app/api/usuarios/route.ts. Los permisos a nivel de columna en Postgres
-- se combinan con RLS: revocamos el UPDATE general y lo volvemos a
-- otorgar solo sobre las columnas que un usuario debe poder editar de
-- sí mismo (nombre, avatar_url) — `rol` queda escribible únicamente por
-- el cliente service_role usado en app/api/usuarios/route.ts.
revoke update on perfiles from authenticated;
grant update (nombre, avatar_url) on perfiles to authenticated;
