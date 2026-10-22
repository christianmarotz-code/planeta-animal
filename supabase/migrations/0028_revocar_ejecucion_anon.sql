-- Cierra el acceso anónimo a las funciones SECURITY DEFINER.
--
-- Las migraciones anteriores hacían `revoke ... from public`, pero Supabase
-- concede EXECUTE directamente al rol `anon`, así que ese revoke no lo quitaba.
-- Resultado: cualquiera con la clave pública podía llamar a estas funciones por
-- /rest/v1/rpc/. Las helpers internas (_aplicar_items_factura, etc.) no validan
-- usuario y modifican stock, por eso son el riesgo real.

-- Funciones que usa la app (siempre con sesión iniciada): solo `authenticated`.
revoke execute on function public.ajustar_stock_manual(uuid, numeric, text) from anon;
revoke execute on function public.anular_factura_compra(uuid) from anon;
revoke execute on function public.anular_venta(uuid) from anon;
revoke execute on function public.cambiar_pronto_pago_factura(uuid, numeric) from anon;
revoke execute on function public.confirmar_entrada_stock(uuid, numeric, text) from anon;
revoke execute on function public.editar_factura_compra(uuid, jsonb) from anon;
revoke execute on function public.registrar_factura_compra(jsonb) from anon;
revoke execute on function public.registrar_venta(jsonb) from anon;

-- Helpers internas: solo las llaman otras funciones SECURITY DEFINER (corren
-- como dueño), así que nadie por la API necesita ejecutarlas.
revoke execute on function public._aplicar_items_factura(uuid, jsonb, text) from anon, authenticated;
revoke execute on function public._recalcular_stats_proveedor(uuid) from anon, authenticated;
revoke execute on function public._revertir_stock_factura(uuid, text) from anon, authenticated;
