-- La 0020 agregó estadísticas a proveedores (cantidad de boletas, total
-- acumulado, primera/última boleta, tipos de comprobante) que se recalculan
-- al registrar, editar o anular una factura. Las facturas cargadas antes de
-- la 0020 no pasaron por esas funciones: se recalcula una vez para todos.
-- Solo escribe columnas derivadas; no toca facturas ni stock.
select _recalcular_stats_proveedor(id) from proveedores;
