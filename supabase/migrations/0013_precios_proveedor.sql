-- Comparador de precios de mayoristas: guarda el último precio conocido de
-- cada producto por proveedor, cargado a partir de listas exportadas de
-- cada portal (Don Orione, Arcuri, Bruncas, Krönen, La Sin Rival, etc.).
-- Un producto puede no tener fila para un proveedor si nunca se importó
-- ese cruce o el proveedor no lo vende.
create table precios_proveedor (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references proveedores(id) on delete cascade,
  producto_id uuid not null references productos(id) on delete cascade,
  precio numeric not null check (precio >= 0),
  actualizado_en timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (proveedor_id, producto_id)
);

alter table precios_proveedor enable row level security;

create policy "authenticated_full_access" on precios_proveedor
  for all to authenticated using (true) with check (true);
