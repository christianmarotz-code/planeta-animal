-- Fase 1 (migración 0001) dejó "authenticated_full_access" en productos,
-- proveedores, facturas_compra, items_factura, movimientos_stock,
-- precios_proveedor y gastos: cualquier usuario logueado, empleado o
-- administrador, puede insertar/actualizar/borrar directamente en esas
-- tablas. La UI ya oculta los botones de edición a empleados
-- (useEsAdministrador), pero eso no es una barrera real: con la sesión
-- del navegador y la clave anon, un empleado puede llamar a
-- supabase.from('gastos').delete() desde la consola y Postgres lo acepta.
--
-- Esta migración reemplaza esa política única por lectura abierta +
-- escritura restringida a administradores, replicando el patrón ya usado
-- para `perfiles.rol` (0008) y el bucket `facturas-adjuntos` (0014).
--
-- movimientos_stock y facturas_compra/items_factura siguen escribiéndose
-- normalmente por empleados a través de las funciones security definer
-- (ajustar_stock_manual, registrar_factura_compra, anular_factura_compra):
-- esas funciones corren con los privilegios de su dueño y no se ven
-- afectadas por este cambio. Lo que se cierra acá es el bypass de escribir
-- directo a la tabla sin pasar por esas funciones.

-- CREATE POLICY solo acepta un comando por cláusula FOR (no "insert, update,
-- delete" como lista), así que cada tabla de solo-escritura-admin recibe
-- una policy de INSERT, una de UPDATE y una de DELETE.

drop policy "authenticated_full_access" on productos;
create policy "productos_lectura" on productos
  for select to authenticated using (true);
create policy "productos_insertar_admin" on productos
  for insert to authenticated
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));
create policy "productos_actualizar_admin" on productos
  for update to authenticated
  using (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'))
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));
create policy "productos_borrar_admin" on productos
  for delete to authenticated
  using (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));

drop policy "authenticated_full_access" on proveedores;
create policy "proveedores_lectura" on proveedores
  for select to authenticated using (true);
create policy "proveedores_insertar_admin" on proveedores
  for insert to authenticated
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));
create policy "proveedores_actualizar_admin" on proveedores
  for update to authenticated
  using (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'))
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));
create policy "proveedores_borrar_admin" on proveedores
  for delete to authenticated
  using (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));

drop policy "authenticated_full_access" on precios_proveedor;
create policy "precios_proveedor_lectura" on precios_proveedor
  for select to authenticated using (true);
create policy "precios_proveedor_insertar_admin" on precios_proveedor
  for insert to authenticated
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));
create policy "precios_proveedor_actualizar_admin" on precios_proveedor
  for update to authenticated
  using (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'))
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));
create policy "precios_proveedor_borrar_admin" on precios_proveedor
  for delete to authenticated
  using (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));

drop policy "authenticated_full_access" on facturas_compra;
create policy "facturas_compra_lectura" on facturas_compra
  for select to authenticated using (true);
create policy "facturas_compra_insertar_admin" on facturas_compra
  for insert to authenticated
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));
create policy "facturas_compra_actualizar_admin" on facturas_compra
  for update to authenticated
  using (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'))
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));
create policy "facturas_compra_borrar_admin" on facturas_compra
  for delete to authenticated
  using (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));

drop policy "authenticated_full_access" on items_factura;
create policy "items_factura_lectura" on items_factura
  for select to authenticated using (true);
create policy "items_factura_insertar_admin" on items_factura
  for insert to authenticated
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));
create policy "items_factura_actualizar_admin" on items_factura
  for update to authenticated
  using (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'))
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));
create policy "items_factura_borrar_admin" on items_factura
  for delete to authenticated
  using (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));

drop policy "authenticated_full_access" on movimientos_stock;
create policy "movimientos_stock_lectura" on movimientos_stock
  for select to authenticated using (true);
create policy "movimientos_stock_insertar_admin" on movimientos_stock
  for insert to authenticated
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));
create policy "movimientos_stock_actualizar_admin" on movimientos_stock
  for update to authenticated
  using (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'))
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));
create policy "movimientos_stock_borrar_admin" on movimientos_stock
  for delete to authenticated
  using (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));

-- Gastos queda admin-only también para lectura: la página ya bloquea todo
-- el módulo a empleados, así que no hay motivo para exponer los datos
-- de gastos vía la API REST directa.
drop policy "authenticated_full_access" on gastos;
create policy "gastos_solo_admin" on gastos
  for all to authenticated
  using (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'))
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'administrador'));
