# Arquitectura de Planeta Animal

Sistema de gestión para una veterinaria y petshop: proveedores, compras, stock, ventas,
gastos y reportes. Next.js (App Router) + Supabase (Postgres, Auth, Storage).

## Dónde vive cada cosa

| Carpeta | Contenido |
|---|---|
| `app/(app)/` | Pantallas con sesión: productos, stock, compras, ventas, proveedores, comparador, gastos, reportes, usuarios, perfil. |
| `app/login/` | Pantalla de ingreso. |
| `app/api/` | Rutas del servidor: `boletas/extraer` (lee la foto con Claude), `comparador/leer-pdf`, `usuarios`, `auth/signout`. |
| `lib/calc/` | Cálculos puros (costo real, boleta, venta, factura). Sin base de datos, con tests. |
| `lib/data/` | Acceso a Supabase desde el navegador, una función por operación. |
| `lib/facturas/` | Lectura de boletas: prompt, saneado de lo extraído, validaciones, guardado. |
| `lib/productos/` | Stock, sectores y subcategorías. |
| `lib/errores.ts` | `mensajeDeError`: convierte cualquier error en un texto para la pantalla. Usarlo en todo `catch`. |
| `proxy.ts` | Middleware: sin sesión, todo redirige a `/login`. |
| `supabase/migrations/` | Esquema completo, numerado. Se aplican a mano en orden. |

## Roles

Hay dos, definidos en `perfiles.rol`: **administrador** y **empleado**.

- Todos leen. Solo el administrador escribe en productos, proveedores, gastos, precios y
  facturas (migración 0015, a nivel de base: no alcanza con ocultar botones).
- Solo administrador: Comparador, Gastos, Reportes y Usuarios (el menú los oculta en
  `components/Sidebar.tsx`), cambiar el pronto pago y corregir una factura.
- La columna `rol` no se puede editar desde el navegador (0008); se cambia por `/api/usuarios`.
- Las rutas de `app/api/` verifican con `requerirAdministrador()`.

## Cómo se carga una compra

1. En **Compras → Nueva** se sacan una o varias fotos de la boleta (o se sube un PDF). Las
   imágenes se reducen en el navegador y se suben al bucket `facturas-adjuntos`.
2. `POST /api/boletas/extraer` (solo administrador) baja las imágenes con URL firmada y le
   pide a Claude que extraiga las líneas con una herramienta de salida estructurada. Se sanea
   lo recibido, se calcula la boleta (`lib/calc/boleta.ts`) y se validan los totales contra lo
   impreso. Si algo no cierra, se muestran alertas en vez de confiar a ciegas.
3. El usuario revisa y corrige la tabla, y asocia cada línea a un producto.
4. `registrar_factura_compra` (función SQL) guarda factura e ítems y **actualiza el costo del
   producto**. Desde la migración 0020 **ya no suma stock**.
5. Genera una **entrada sugerida** (`entradas_stock_sugeridas`). Quien recibe la mercadería la
   confirma en **Stock** con la cantidad que realmente llegó (`confirmar_entrada_stock`); recién
   ahí se suma el stock. Así se cubren faltantes y bolsas rotas.
6. Una factura se puede corregir (`editar_factura_compra`) o anular (`anular_factura_compra`);
   ambas revierten el efecto neto sobre el stock. La anulación corre una sola vez por factura.

También hay carga manual (`FormularioManual.tsx`).

## Costo real de un producto

`lib/calc/costoReal.ts`: costo neto × (1 + IVA + IIBB si aplica + percepción de IVA si aplica)
× (1 − descuento por pronto pago). Las condiciones del proveedor (IIBB, percepciones) están
en `proveedores`; el pronto pago se define por factura (migración 0023, tramos por días).

## Ventas

`registrar_venta` calcula los totales a partir de los ítems (nunca confía en los del
navegador), exige al menos un ítem y descuenta stock; falla con "Stock insuficiente" si no
alcanza. `anular_venta` devuelve el stock y falla si la venta ya estaba anulada. Los ítems
pueden ser productos o servicios.

## Stock

Cada cambio es una fila en `movimientos_stock`; el stock actual es el resultado de esos
movimientos. El ajuste manual (`ajustar_stock_manual`) exige un motivo y no deja el stock en
negativo. Los productos se organizan en rama (Clínica / Petshop) → categoría → subcategoría
(sectores en `lib/productos/sectores.ts`). Un producto con historial no se borra: se desactiva.

## Seguridad: reglas que no hay que romper

- Toda función SQL que escribe es `security definer`, con `search_path` vacío y la guarda
  `auth.uid() is null` al inicio. El permiso de ejecución se da **solo a `authenticated`**.
- Ojo: en Supabase `revoke ... from public` **no alcanza**, `anon` tiene permiso propio. Hay
  que revocar de `anon` explícitamente (ver migraciones 0028 y 0030). Las pruebas de
  `e2e/sin-sesion.spec.ts` verifican que las 11 funciones sigan bloqueadas.
- La clave `service_role` y la de Anthropic solo se usan en el servidor (`lib/supabase/admin.ts`,
  rutas de `app/api/`). Nunca con prefijo `NEXT_PUBLIC_`.
- Cada migración nueva que cree una función debe cerrar con
  `revoke execute ... from public, anon; grant execute ... to authenticated;`.

## Flujo de trabajo

1. `npm run check` antes de cada commit (tipos, lint, tests, build). Ver `docs/PRUEBAS.md`.
2. Las migraciones se prueban primero dentro de una transacción con `ROLLBACK` y se aplican
   a la base real después. No hay base de pruebas.
3. Después de cambiar permisos o funciones, correr el aviso de seguridad de Supabase
   (`get_advisors`) y `npm run e2e`.
