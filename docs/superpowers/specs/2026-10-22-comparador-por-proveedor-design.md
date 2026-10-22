# Comparador por proveedor y por producto, con carga manual y notas de promoción

Fecha: 2026-10-22. Estado: aprobado en el chat.

## Contexto

El comparador actual es una tabla con todos los productos como filas y todos los proveedores como
columnas. Con 1.931 productos y 12 proveedores resulta ilegible, y hoy casi no tiene datos
(solo Bruncas SRL tiene 37 precios). Los empleados ya pueden cargar precios e importar listas
CSV/PDF (pieza 1, migración 0035). Esta pieza reorganiza la pantalla y agrega carga manual y
notas de promoción.

## Alcance

1. Pantalla `/comparador` con dos pestañas: **Por proveedor** (por defecto) y **Por producto**.
2. Planilla de cada proveedor en `/comparador/proveedor/[id]`.
3. Carga manual: botón **+ Cargar precio** y edición de una fila existente.
4. Nota de texto libre por precio, para promociones u otras aclaraciones.
5. El botón **Importar lista** lleva a la importación existente con el proveedor ya elegido.

Fuera de alcance: importar Excel (.xlsx), link al sitio web del proveedor, cálculo automático de
promociones, rentabilidad y estacionalidad, cierre del día.

## Pantallas

**Por proveedor.** Tarjetas, una por proveedor activo, ordenadas primero las que tienen precios.
Cada tarjeta muestra la cantidad de productos con precio, la fecha de la última actualización y,
si corresponde, "Más barato en N" (solo cuenta productos que tienen precio de al menos otro
proveedor, para no dar por ganador a quien no tiene competencia). Sin precios: "Sin precios
todavía". Un buscador filtra por nombre de proveedor.

**Planilla del proveedor.** Encabezado con el nombre, **Importar lista** y **+ Cargar precio**.
Buscador de productos. Tabla con producto, precio, nota, comparación con otros proveedores y fecha
de actualización. La comparación dice "El más barato", "X % más caro que <proveedor>" o "Solo este
proveedor". Los precios con más de 30 días se marcan en rojo. **Editar** convierte la fila en
campos de precio y nota con Guardar y Cancelar.

**+ Cargar precio.** Buscador de producto (muestra hasta 8 coincidencias), precio y nota. Si el
proveedor ya tiene precio para ese producto, avisa que se va a actualizar. El precio acepta formato
argentino (`1.200,50`) y se rechaza si no es mayor a cero.

**Por producto.** Buscador de producto (hasta 20 resultados) y filtro para elegir con qué
proveedores comparar. Cada resultado muestra el ranking de proveedores del más barato al más
caro, con precio, nota y fecha, marcando el primero y los precios viejos.

## Datos

- Migración 0036: columna `precios_proveedor.nota` (texto, máximo 200 caracteres, opcional) y
  ajuste del trigger de auditoría para que también registre los cambios de nota
  (`nota_anterior`, `nota_nueva` en el detalle). Se pega a mano en Supabase.
- `FilaComparador.precios` suma `precioId` y `nota`. `mejor` no cambia: la pantalla Reposición
  (`agruparReposicionSugerida`) sigue funcionando igual.
- La importación de listas no toca `nota`: su upsert solo escribe proveedor, producto, precio y fecha.
- Permisos: los de la pieza 1; no hay cambios de políticas.

## Reglas de negocio

- Un precio es "viejo" si su `actualizado_en` tiene más de 30 días (constante `DIAS_PRECIO_VIEJO`).
- "Más barato": el precio de menor valor entre los proveedores que tienen ese producto; en empate
  ambos figuran como más baratos.
- El historial del proveedor (pieza 1) describe también los cambios de nota.

## Pruebas

Funciones puras con pruebas unitarias: interpretación de precios, comparación, resumen por
proveedor, planilla, ranking y descripción de cambios con nota. La interfaz se verifica con
`typecheck`, `lint` y una prueba manual con una cuenta de empleado y una de administrador.
