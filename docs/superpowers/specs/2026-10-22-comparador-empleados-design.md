# Comparador y proveedores abiertos a empleados (pieza 1)

Fecha: 2026-10-22. Estado: pendiente de revisión.

## Contexto

Los empleados van a buscar precios de los proveedores (en sus sitios web, listas en PDF o
Excel) y a cargarlos en el sistema para decidir a quién comprarle. Hoy solo un administrador
puede hacerlo: el Comparador está oculto del menú (`soloAdmin`), la pantalla de importar
muestra "Acceso restringido", `/api/comparador/leer-pdf` exige administrador y las políticas
RLS de `precios_proveedor` y `proveedores` bloquean insertar/actualizar a no administradores.

Este documento cubre la **pieza 1** de cuatro:

1. Abrir el comparador y los proveedores a empleados, con registro de quién hizo qué. ← este
2. Carga manual rápida dentro del comparador (celda editable, precios viejos marcados).
3. Sitio web de cada proveedor (campo + botón "Ir al sitio" + búsqueda directa configurable).
4. Importar Excel (.xlsx) directamente.

## Permisos

| Acción | Empleado | Administrador |
|---|---|---|
| Ver comparador y precios | Sí | Sí |
| Insertar / actualizar `precios_proveedor` (a mano o importando CSV/PDF) | Sí | Sí |
| Borrar precios | No | Sí |
| Crear / editar proveedores | Sí | Sí |
| Cambiar IIBB, percepción de IVA, descuento por pronto pago | No | Sí |
| Borrar proveedores | No | Sí |

Los datos fiscales del proveedor alteran el cálculo de las facturas. La pantalla ya los oculta
a empleados, pero la base no puede ocultar columnas sueltas, así que un trigger
`BEFORE INSERT OR UPDATE` en `proveedores` rechaza el cambio de esas columnas si el usuario no es
administrador (en un INSERT las deja en sus valores por defecto). Las columnas de estadísticas
(`cantidad_boletas`, `total_acumulado`, `primera_boleta`, `ultima_boleta`) las siguen escribiendo
las funciones de facturas y no se controlan.

## Registro de cambios (quién hizo qué)

Tabla `registro_cambios`:

- `id`, `creado_en`
- `usuario_id` (uuid, `on delete set null`) y `usuario_nombre` (texto, copia del nombre al
  momento del cambio; así el registro sigue legible si se elimina al usuario)
- `tabla` (`proveedores` | `precios_proveedor`), `registro_id`, `operacion` (`insert` | `update` | `delete`)
- `proveedor_id` (para listar el historial de un proveedor, incluye sus precios)
- `detalle` (jsonb compacto)

Se llena con un trigger `AFTER INSERT OR UPDATE OR DELETE` (función `SECURITY DEFINER`,
`search_path` vacío) en `proveedores` y `precios_proveedor`:

- **`precios_proveedor`**: guarda `producto_id`, `precio_anterior`, `precio_nuevo`. En un update
  solo registra si el precio cambió (re-importar la misma lista no genera ruido).
- **`proveedores`**: guarda solo los campos que cambiaron, `{campo: {antes, despues}}`, sin las
  columnas de estadísticas.
- Sin sesión (`auth.uid()` nulo) el nombre queda como "Sistema".

Lectura: cualquier usuario con sesión. Escritura: solo el trigger (sin políticas de insert,
update ni delete para usuarios).

Una importación de lista genera una fila por precio nuevo o cambiado. Es aceptable; si el
volumen molesta, se agrupa en una pieza posterior.

## Cambios en la app

- `components/Sidebar.tsx`: Comparador sin `soloAdmin`.
- `app/(app)/comparador/importar/page.tsx`: quitar el bloqueo de no administradores.
- `lib/auth/requerirSesion.ts` (nuevo): exige solo sesión iniciada. `requerirAdministrador` no cambia.
- `app/api/comparador/leer-pdf/route.ts`: usar `requerirSesion`.
- `lib/data/registroCambios.ts` (nuevo): `listarCambiosProveedor(proveedorId)`.
- `app/(app)/proveedores/[id]/page.tsx`: sección "Historial de cambios" con fecha, quién y qué cambió
  (por ejemplo "Nacho · 22/10 · Precio de X: $1.200 → $1.350").
- Las pantallas de proveedores ya ocultan los campos fiscales a empleados; no requieren cambios.

## Migración 0035

Un solo archivo SQL que la persona dueña pega en el SQL Editor (el acceso de Claude a Supabase es
de solo lectura): políticas de `precios_proveedor` y `proveedores`, tabla `registro_cambios` con
su política de lectura, las dos funciones trigger y los triggers. Al terminar, se verifica con
consultas de solo lectura.

## Pruebas

- Unitarias de la función que arma el detalle del cambio en la app y de `requerirSesion`.
- Verificación en la base, en solo lectura: políticas, triggers y que los datos fiscales queden
  protegidos (por inspección de la definición del trigger).
- Prueba manual con una cuenta de empleado: cargar un precio, crear y editar un proveedor, ver el
  historial. Después eliminar esa cuenta de prueba.

## Fuera de alcance

Celda editable en el comparador (pieza 2), sitio web del proveedor (pieza 3), Excel directo
(pieza 4), cerrar la lectura de totales por API (decisión aparte, aceptada a propósito).
