-- 0037: endurecimiento de seguridad (sin cambios de comportamiento para el uso normal).
--
-- 1) perfiles: los perfiles los crea solo el servidor con la service_role (invitación de usuarios).
--    Quitarle INSERT a authenticated evita que alguien con sesión y sin perfil se cree uno con
--    rol 'administrador'. service_role conserva su permiso.
revoke insert on table public.perfiles from authenticated;
revoke insert on table public.perfiles from anon;

-- 2) Buckets: tope de tamaño y tipos de archivo permitidos.
--    avatars es público, así que no debe aceptar cualquier archivo.
update storage.buckets
set file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'avatars';

--    facturas-adjuntos: fotos y PDF de boletas (mismo tope de 15 MB que el lector de PDF).
update storage.buckets
set file_size_limit = 15 * 1024 * 1024,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf'
    ]
where id = 'facturas-adjuntos';
