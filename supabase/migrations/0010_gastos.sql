-- Gastos generales del negocio: combustible, servicios (luz/gas/agua/internet),
-- indumentaria y otros costos que no son compra de mercadería/stock.
create table gastos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  categoria text not null check (
    categoria in ('combustible', 'servicios', 'indumentaria', 'impuestos', 'otro')
  ),
  concepto text not null,
  proveedor text,
  monto numeric not null check (monto >= 0),
  rama text check (rama in ('clinica', 'petshop')),
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

alter table gastos enable row level security;

create policy "authenticated_full_access" on gastos
  for all to authenticated using (true) with check (true);
