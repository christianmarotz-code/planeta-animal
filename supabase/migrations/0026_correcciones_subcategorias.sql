-- Correcciones manuales a la clasificación inicial de la 0025, hechas tras
-- revisar con el negocio los productos que habían quedado en 'Sin clasificar'.
-- Se identifican por nombre y rama (no por id) para que la migración sirva
-- también si la base se reconstruye desde cero. Solo toca filas que siguen en
-- 'Sin clasificar', así que no pisa correcciones posteriores. Idempotente.
update productos p
set subcategoria = v.subcategoria
from (values
  ('FEBEXUR',                                      'clinica', 'Antiparasitario - comprimidos, sprays y otros'),
  ('EPIFEN 640MG X 100 COMP',                      'clinica', 'Medicamento - antibióticos y antimicóticos'),
  ('PREGALBECH X 30 ML',                           'clinica', 'Medicamento - antiinflamatorios, analgésicos y antialérgicos'),
  ('LIQUIDO DE PUNCIÓN',                           'clinica', 'Estudio de laboratorio (mover a servicios)'),
  ('OHM X 7 COMPRIMIDOS',                          'clinica', 'Neurología, comportamiento y hormonales'),
  ('RELAY C 100mcg',                               'clinica', 'Neurología, comportamiento y hormonales'),
  ('RELAY C comprimidos',                          'clinica', 'Neurología, comportamiento y hormonales'),
  ('PRIVAPROL JERINGA x 2 ml',                     'clinica', 'Neurología, comportamiento y hormonales'),
  ('T4 F BLISTER X 10 COMP',                       'clinica', 'Neurología, comportamiento y hormonales'),
  ('PROFESIONAL VET NUTRICION COMPLETA AD X 20 KG', 'petshop', 'Alimento - perro'),
  ('VC NUTRIQUE VIAS URINARIAS SENSIBLES X500GR',  'petshop', 'Alimento - gato')
) as v(nombre, rama, subcategoria)
where p.nombre = v.nombre
  and p.rama = v.rama
  and p.subcategoria = 'Sin clasificar';

-- NERO 40 ya no existe en el mercado: se desactiva, no se borra, para
-- conservar el historial de compras y movimientos que lo referencian.
update productos
set activo = false
where nombre = 'NERO 40 X 3 ML' and rama = 'clinica' and activo;
