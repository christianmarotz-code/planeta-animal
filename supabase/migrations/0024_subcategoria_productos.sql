-- Tercer nivel de clasificación de productos (rama > categoria > subcategoria).
-- Nullable a propósito: los productos existentes quedan sin subcategoría hasta
-- que la 0025 los clasifique por palabras clave del nombre. No toca rama ni
-- categoria.
alter table productos add column if not exists subcategoria text;

create index if not exists productos_rama_subcategoria_idx
  on productos (rama, subcategoria);
