-- Desactiva el producto provisorio "nuevo": sin rama ni categoría, creado desde
-- la factura de prueba 12345 de Arcuri S.A. (25 unidades a $70). Se desactiva en
-- vez de borrar para no romper el historial de compras y movimientos que lo
-- referencian. Esa factura sigue registrada: para revertir las 25 unidades de
-- stock hay que anularla desde Compras. Idempotente.
update productos
set activo = false
where nombre = 'nuevo' and rama is null and activo;
