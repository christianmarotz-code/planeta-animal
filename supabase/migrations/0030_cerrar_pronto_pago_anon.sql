-- La 0028 no alcanzó a cambiar_pronto_pago_factura: su permiso para anon venía del
-- grupo `public` (la 0023 no lo había revocado). Se revoca de ambos y se deja
-- solo para usuarios con sesión.
revoke execute on function public.cambiar_pronto_pago_factura(uuid, numeric) from public, anon;
grant execute on function public.cambiar_pronto_pago_factura(uuid, numeric) to authenticated;
