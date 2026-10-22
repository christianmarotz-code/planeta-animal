-- Los 10 medicamentos de clínica que la 0025/0026 dejaron "Sin clasificar".
-- No se pudo ubicar cada uno con certeza en antibióticos, antiinflamatorios, etc.,
-- así que van a un sector propio hasta que se reclasifiquen desde Editar producto.
-- Se identifican por id (no por nombre) para no tocar nada más.
update public.productos
set subcategoria = 'Medicamento - otros'
where activo
  and subcategoria = 'Sin clasificar'
  and id in (
    '67cb756f-9e7d-414b-8447-c5bbe318ad91', -- Algen 20mg x120 comp
    '01ace17d-3188-43bc-bbbd-92deacf28e65', -- Bovicine I x50ml
    '0973baef-ea32-451a-9e2a-baca745e309e', -- Cesnefin (solo perros)
    '6ee1f8a3-0089-4788-be3d-6ae3a89aa21b', -- Contal 15 mg
    '73a5c538-82dc-49ca-ade7-a43a50c4f81c', -- Contal 60 mg
    'cbee7f53-b008-44ae-83de-3df6f441b78e', -- Episol x18 comp
    'aa006add-b441-494a-b807-043cd71f6c92', -- Novul x100 comp
    '6646fff0-6e17-482c-947e-47e02332a5aa', -- Spectril 10 x 20 comp
    'cebf9bde-81dd-416a-93d4-b6476d4a435b', -- TIU blister 10 comp
    '97eeb5af-f4a6-4b63-8814-3502b4c08757'  -- TIU x 30 comp
  );
