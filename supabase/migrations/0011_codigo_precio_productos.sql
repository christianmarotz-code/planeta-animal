-- Código interno, código de barras y precio de venta de MyVete no tenían
-- columna propia; se agregan para poder importar el catálogo exportado y,
-- a futuro, cruzar por código con las listas de precios de los mayoristas.
alter table productos
  add column codigo text,
  add column codigo_barras text,
  add column precio_venta numeric not null default 0;
