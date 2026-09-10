-- Distingue a qué línea de negocio pertenece cada producto: clínica
-- veterinaria o petshop. Nullable a propósito — los productos existentes
-- quedan sin clasificar hasta que un administrador los revise, en vez de
-- asumir una rama incorrecta por default.
alter table productos add column rama text check (rama in ('clinica', 'petshop'));
