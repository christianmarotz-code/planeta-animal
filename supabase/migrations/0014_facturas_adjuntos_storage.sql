-- Bucket privado para las fotos de facturas que el admin sube para
-- reconocimiento automático. A diferencia de "avatars" (público, 0006),
-- las facturas pueden contener datos comerciales sensibles, así que el
-- acceso queda restringido a administradores (no "dueño de la carpeta":
-- cualquier admin debe poder ver una factura subida por otro admin).
insert into storage.buckets (id, name, public)
values ('facturas-adjuntos', 'facturas-adjuntos', false);

create policy "admins suben adjuntos de facturas"
  on storage.objects for insert
  with check (
    bucket_id = 'facturas-adjuntos'
    and exists (
      select 1 from perfiles where id = auth.uid() and rol = 'administrador'
    )
  );

create policy "admins ven adjuntos de facturas"
  on storage.objects for select
  using (
    bucket_id = 'facturas-adjuntos'
    and exists (
      select 1 from perfiles where id = auth.uid() and rol = 'administrador'
    )
  );
