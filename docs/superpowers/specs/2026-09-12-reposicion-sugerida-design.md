# Reposición Sugerida — Design Spec

**Fecha:** 2026-09-12
**Contexto:** Planeta Animal ya tiene tres piezas que hoy no están conectadas entre sí: `/stock` marca con un chip rojo los productos en `stock_actual <= stock_minimo`; `/comparador` muestra, por producto, el precio de cada proveedor cargado (vía CSV) y cuál es el más barato (`lib/data/preciosProveedor.ts`, función `listarComparador()`); y `/compras/nueva` arma una factura de compra a mano, producto por producto. Hoy alguien tiene que acordarse de mirar `/stock`, después ir a `/comparador` a ver qué proveedor conviene, y después cargar la compra en `/compras/nueva` tipeando todo de nuevo. Esta feature conecta las tres piezas.

## Objetivo

Una vista nueva, "Reposición sugerida", que:
1. Lista los productos en stock bajo mínimo.
2. Para cada uno, si hay precios cargados en el comparador, resuelve el proveedor más barato y una cantidad sugerida.
3. Agrupa esos productos por proveedor más barato, para poder armar una compra por proveedor con un clic.
4. Deja aparte, en una lista informativa, los productos en stock bajo que no tienen ningún precio cargado en el comparador (no se puede sugerir proveedor).

## Fuera de alcance

- Cualquier sistema de "reserva" de la sugerencia (no se descuenta ni marca nada al generar una compra sugerida — es solo una ayuda para armar la compra, el producto sigue apareciendo en la lista hasta que la compra real se cargue y el stock suba).
- Persistir la sugerencia entre sesiones o dispositivos (no hay tabla nueva en la base de datos) — ver "Decisión: mecanismo de traspaso" abajo.
- Editar el comparador o los datos de stock desde esta pantalla — son de solo lectura acá, se editan en `/comparador` y `/stock` como hoy.
- Elegir automáticamente un proveedor cuando el producto no tiene ningún precio cargado — esos productos solo se listan, sin acción.

## Decisiones ya tomadas

- **Ubicación:** página nueva en el sidebar (`/reposicion`), junto a Comparador y Stock — no una sección dentro de `/stock` ni un widget del dashboard.
- **Agrupación:** por proveedor más barato. Se arman "paquetes" — todos los productos donde ese proveedor es el más barato quedan juntos, con un botón "Crear compra" por paquete.
- **Cantidad sugerida:** `stock_minimo − stock_actual`, con mínimo 1 (reponer hasta el mínimo). Queda editable antes de confirmar la compra.
- **Sin precio cargado:** los productos en stock bajo sin ningún precio en el comparador se muestran en una lista aparte, sin proveedor ni botón de acción.
- **Mecanismo de traspaso a `/compras/nueva`:** `sessionStorage`, no una tabla nueva en la base de datos. Dura solo esa pestaña/sesión del navegador, no necesita esquema nuevo ni políticas de RLS, y es lo mínimo que resuelve "pasar el proveedor y los ítems de una pantalla a la otra". Si en el futuro se pidiera "guardar la sugerencia para retomarla en otro momento", ahí se justificaría una tabla — no antes.

## Arquitectura

### Datos: `lib/data/reposicion.ts`

```ts
export interface ItemReposicion {
  producto: Producto
  cantidadSugerida: number
  precio: number
}

export interface PaqueteReposicion {
  proveedor: Proveedor
  items: ItemReposicion[]
}

export interface ReposicionSugerida {
  paquetes: PaqueteReposicion[]
  sinPrecio: Producto[]
}

export async function listarReposicionSugerida(): Promise<ReposicionSugerida>
```

`listarReposicionSugerida()`:
1. Llama en paralelo a `listarProductos({ soloStockBajo: true })` (ya existe, filtra `stock_actual <= stock_minimo`) y `listarComparador()` (ya existe, devuelve `FilaComparador[]` — pero solo incluye productos que tienen al menos un precio cargado; los que no tienen ninguno directamente no aparecen ahí).
2. Arma un `Map<string, FilaComparador>` por `producto.id` a partir del resultado del comparador.
3. Para cada producto en stock bajo:
   - Si está en el map: calcula `cantidadSugerida = Math.max(1, producto.stock_minimo - producto.stock_actual)`, y agrega un `ItemReposicion` al paquete del `fila.mejor.proveedor.id` (usa un `Map<string, PaqueteReposicion>` para acumular, igual que el patrón ya usado en `calcularGastoPorProveedor` de `lib/data/reportes.ts`).
   - Si no está en el map: se agrega a `sinPrecio`.
4. Devuelve `{ paquetes: Array.from(map.values()), sinPrecio }`. Los paquetes no necesitan un orden particular (la UI puede listarlos en el orden que vengan).

### UI: `app/(app)/reposicion/page.tsx` (nueva)

Mismo patrón visual que `/comparador` y `/stock` (`shell`/`core`, `rise`, tipografía existente). Estructura:

1. Encabezado "Reposición sugerida" (mismo estilo `GESTIÓN` / `<h1>` que el resto de las páginas de gestión).
2. Un bloque por cada `PaqueteReposicion`: nombre del proveedor como título, tabla con producto / cantidad sugerida (input numérico editable, uno por fila) / precio unitario / subtotal calculado, y un botón "Crear compra con {proveedor.nombre}" al pie del bloque.
3. Debajo de los paquetes, un bloque "Sin precio cargado" con la lista de `sinPrecio` (nombre, stock actual/mínimo) y un link a `/comparador` para cargar precios.
4. Estado vacío: si `paquetes.length === 0 && sinPrecio.length === 0`, mensaje "No hay productos en stock bajo mínimo" (mismo patrón que "Ningún producto está bajo el mínimo" ya usado en `/reportes`).

Al tocar "Crear compra con {proveedor}":
- Arma un objeto borrador con la cantidad **editada** en pantalla (no la sugerida original, si el usuario la cambió) para cada ítem del paquete:
  ```ts
  interface BorradorReposicion {
    proveedorId: string
    items: { productoId: string; cantidad: number; costoUnitario: number; alicuotaIva: number }[]
  }
  ```
  `costoUnitario` viene de `item.precio` (el precio del comparador para ese proveedor), `alicuotaIva` viene de `producto.alicuota_iva`.
- Guarda ese objeto como JSON en `sessionStorage` bajo la clave `'reposicion-draft'`.
- Navega a `/compras/nueva` (`router.push`).

### `/compras/nueva` — leer el borrador

Al montar el componente, después de cargar `proveedores` y `productos` (los `useEffect` ya existentes), si existe `sessionStorage.getItem('reposicion-draft')`:
1. Parsea el JSON.
2. Setea `proveedorId` al `proveedorId` del borrador.
3. Reemplaza el array `items` (que arranca con un `ItemDraft` vacío) por un `ItemDraft` por cada ítem del borrador: `producto_id`, `productoTexto` resuelto del nombre del producto, `cantidad`/`costo_unitario`/`alicuota_iva` como string (mismo formato que el resto del formulario).
4. Borra la clave (`sessionStorage.removeItem('reposicion-draft')`) para que no se re-aplique si el usuario vuelve a entrar a `/compras/nueva` más tarde en la misma sesión.

**No se prefill de `numero_comprobante`, `tipo_comprobante` ni `fecha`** — esos datos vienen de la factura real que todavía no llegó; se completan a mano cuando el proveedor la envía, igual que hoy.

### Sidebar

Se agrega un ítem "Reposición" en `components/Sidebar.tsx`, junto a Comparador y Stock (mismo grupo de navegación).

## Testing

- `lib/data/reposicion.test.ts` (mismo patrón que `lib/data/reportes.test.ts` y `lib/data/facturaMatching.test.ts`: sin Supabase, mockeando los datos de entrada) — pero como `listarReposicionSugerida` llama directamente a `listarProductos`/`listarComparador` (que sí pegan contra Supabase), la función se prueba **refactorizando la lógica de agrupación a una función pura** que reciba `productos: Producto[]` y `filas: FilaComparador[]` ya resueltos, y devuelva `ReposicionSugerida` — análoga a cómo `lib/data/reportes.ts` separa el cálculo puro de la carga de datos. `listarReposicionSugerida` queda como una capa fina que carga los datos y llama a esa función pura.
  - Casos: producto en stock bajo con precio cargado se agrupa bajo el proveedor más barato; cantidad sugerida es `stock_minimo - stock_actual` con piso en 1; producto en stock bajo sin precio cargado va a `sinPrecio`; dos productos con el mismo proveedor más barato quedan en el mismo paquete; producto que no está en stock bajo no aparece en ningún lado (ya lo filtra `listarProductos({soloStockBajo:true})`, no hace falta re-testear esa función).
- El mecanismo de `sessionStorage` y el flujo de `/compras/nueva` leyendo el borrador no llevan test automatizado (es interacción de UI con `sessionStorage`, no hay tests de componente en este proyecto) — se verifica manualmente en el navegador: generar una compra sugerida desde `/reposicion` y confirmar que `/compras/nueva` llega con el proveedor y los ítems precargados.

## Error handling

- Si `listarProductos` o `listarComparador` fallan, se propaga el error igual que en el resto de las páginas (no hay manejo especial nuevo).
- Si el JSON en `sessionStorage` está corrupto o con una forma inesperada (no debería pasar, pero por robustez ante un borrador viejo de una versión anterior del código): envolver el `JSON.parse` y la lectura de campos en un `try/catch` que, si falla, ignora el borrador silenciosamente y limpia la clave — no debe romper la carga de `/compras/nueva`.
