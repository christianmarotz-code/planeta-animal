-- Función huérfana: resto de un script de importación. No estaba en ninguna migración,
-- ningún código la llamaba y nada dependía de ella. Se ejecutó a mano en Supabase.
drop function if exists public.pg_temp_agregar_item(uuid, text, numeric, numeric, uuid, numeric);
