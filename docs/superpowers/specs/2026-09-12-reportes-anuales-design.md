# Reportes Anuales y Ranking de Productos — Design Spec

**Fecha:** 2026-09-12
**Contexto:** Extensión de `lib/data/reportes.ts` y de las páginas `app/(app)/reportes/page.tsx` y `app/(app)/page.tsx` (dashboard) de Planeta Animal. Construye sobre el módulo de analítica de gastos ya existente (`calcularGastoPorMes`, `calcularGastoPorSemana`, `calcularGastoPorDiaSemana`, documentado en `docs/superpowers/specs/2026-09-09-analitica-gastos-periodo-design.md`), que hoy trabaja sobre ventanas rodantes (últimos N meses/semanas) sin noción de año calendario ni de producto.

## Objetivo

El cliente quiere, además de las tendencias rodantes que ya existen, poder:

1. Ver de un vistazo cuánto se gastó **esta semana** y **este mes** sin entrar a `/reportes`.
2. Comparar un **año calendario completo** por trimestre, para saber en qué etapa del año se compra más o menos.
3. Saber, dentro de cada mes, **qué semana concentró más gasto**.
4. Ver un **ranking de productos por cantidad comprada** (más y menos comprados) en un año dado.

Esto es analítica sobre **compras** (`facturas_compra` / `items_factura`), igual que el resto del módulo — no hay datos de ventas todavía.

## Fuera de alcance

- Comparar múltiples años lado a lado en un mismo gráfico (el selector de año muestra un año a la vez).
- Ranking de productos por monto gastado — se definió explícitamente por **cantidad** (`item.cantidad`), no por `$`.
- Agrupación por estación del año (verano/invierno) — se usa trimestre calendario (Q1–Q4) por simplicidad.
- Cualquier acción sobre el ranking de productos (ej. "reponer el más vendido") — es una vista de lectura, no se conecta todavía con compras o stock.

## Decisiones de alcance temporal

- **Dashboard (home):** dos números fijos, sin selector — gasto de la semana en curso y gasto del mes en curso. Reutilizan `calcularGastoPorSemana(facturas, 1)[0]` y `calcularGastoPorMes(facturas, 1)[0]`, que ya excluyen anuladas y ya manejan "sin facturas → 0".
- **`/reportes` — sección anual:** opera sobre **año calendario** (1 ene–31 dic), con un selector de año. Las opciones del selector son los años que aparecen en `facturas.fecha` (calculados en el cliente a partir de las facturas ya cargadas), ordenados descendente; si no hay facturas, se muestra el año actual como única opción y las secciones quedan vacías.

## Arquitectura

Mismo enfoque que el resto de `lib/data/reportes.ts`: funciones puras en TypeScript sobre los arrays ya traídos por la página (sin agregación en Postgres), testeadas con datos mock y una fecha/año de referencia explícitos.

### Funciones nuevas en `lib/data/reportes.ts`

```ts
export function anosConFacturas(facturas: FacturaCompra[]): number[]
```
- Devuelve los años (`fecha.getFullYear()`) presentes en `facturas`, sin duplicados, orden descendente.
- Si `facturas` está vacío, devuelve `[]` — la página decide el fallback (año actual).

```ts
export function calcularGastoPorTrimestre(
  facturas: FacturaCompra[],
  anio: number
): { trimestre: 'Q1' | 'Q2' | 'Q3' | 'Q4'; total: number }[]
```
- Siempre devuelve las 4 entradas en orden, aunque estén en 0.
- Filtra `facturas` a las del `anio` dado (usando la misma `parseFechaLocal` ya existente en el módulo) y excluye `estado === 'anulada'`.
- Q1 = ene-mar, Q2 = abr-jun, Q3 = jul-sep, Q4 = oct-dic.

```ts
export function calcularSemanaGanadoraPorMes(
  facturas: FacturaCompra[],
  anio: number
): { mes: string; semana: number; total: number }[]
```
- Devuelve 12 entradas, una por mes del `anio` (`mes` en formato `'YYYY-MM'`).
- Dentro de cada mes, agrupa las facturas por "semana del mes" según el día calendario: semana 1 = días 1–7, semana 2 = 8–14, semana 3 = 15–21, semana 4 = 22–28, semana 5 = 29–31.
- `semana` es el número (1–5) de la semana con mayor total dentro de ese mes; `total` es el gasto de esa semana ganadora.
- Si el mes no tiene facturas, `semana: 0, total: 0` (la UI lo muestra como "sin datos", no como semana 1 con total 0 — evita sugerir una semana ganadora falsa).

```ts
export function calcularProductosMasComprados(
  items: ItemFactura[],
  facturas: FacturaCompra[],
  productos: Producto[],
  anio: number
): { producto: string; cantidad: number }[]
```
- Reutiliza el patrón de `enriquecerItems` (ya filtra facturas anuladas) agregando el filtro por año sobre `factura.fecha`.
- Suma `item.cantidad` por `producto_id`, resuelve el nombre contra `productos` (fallback `'Desconocido'` igual que las funciones de gasto existentes).
- Devuelve el arreglo completo ordenado descendente por `cantidad` — la UI toma los primeros N para "más comprados" y los últimos N (con `cantidad > 0`, es decir que sí se compraron al menos una vez en el año) para "menos comprados". Productos nunca comprados ese año no aparecen (no hay entrada que agregar) — no se listan como "0 comprado".

Todas reciben `anio` como número explícito (no `hoy: Date`), porque a diferencia del resto del módulo no son ventanas rodantes sino un año calendario fijo elegido por el usuario.

## UI

### Dashboard (`app/(app)/page.tsx`)

Dos tarjetas nuevas usando el componente `StatShell`/`HeroStatCard` ya existente en la página (mismo estilo que las tarjetas actuales), ubicadas junto a las demás tarjetas de resumen:

- **"Gastado esta semana"** — valor de `calcularGastoPorSemana(facturas, 1)[0].total`, link a `/reportes`.
- **"Gastado este mes"** — valor de `calcularGastoPorMes(facturas, 1)[0].total`, link a `/reportes`.

Sin `delta` (variación %) por ahora — no se pidió, y calcularlo bien (vs. semana/mes anterior completo vs. lo que va) es ambiguo; se deja para una iteración futura si se pide.

### `/reportes` — nueva sección "Análisis anual"

Debajo de las secciones existentes (gasto por proveedor, por mes, por semana, por día). Incluye:

1. **Selector de año** — `<select>` simple con las opciones de `anosConFacturas(facturas)` (o `[añoActual]` si viene vacío); controla las 3 sub-secciones siguientes.
2. **"Gasto por trimestre"** — gráfico de barras (mismo componente `GraficoBarras` ya usado en la página), 4 barras Q1–Q4.
3. **"Semana que más gastó, por mes"** — tabla de 12 filas (mes, semana ganadora, total), con "—" en la fila cuando `semana === 0` (mes sin facturas).
4. **"Productos más y menos comprados"** — dos listas lado a lado (2 columnas en desktop, apiladas en mobile), top 10 y bottom 10 de `calcularProductosMasComprados`, mostrando nombre y cantidad. Si hay 10 o menos productos con compras en el año, ambas listas pueden coincidir parcialmente — no se filtra ese solape, es información correcta igual.

Todas las sub-secciones manejan "sin datos" mostrando el estado vacío ya usado en el resto de la página (mensaje tipo "Sin facturas en este período", igual al patrón de `movimientos.length === 0` en `/stock`).

## Testing

TDD, extendiendo `lib/data/reportes.test.ts` con el mismo patrón (helper `factura()`, `item()`, año/fecha de referencia explícitos, nunca `new Date()` implícito):

- `anosConFacturas`: dedup y orden descendente; array vacío da `[]`.
- `calcularGastoPorTrimestre`: agrupa bien en los 4 trimestres, excluye anuladas, excluye facturas de otro año, meses límite (mar/abr, jun/jul, etc.) caen en el trimestre correcto.
- `calcularSemanaGanadoraPorMes`: identifica la semana correcta dentro de un mes con datos en varias semanas; mes sin facturas da `semana: 0`; días 29–31 caen en la semana 5.
- `calcularProductosMasComprados`: suma cantidades correctamente por producto, excluye anuladas, excluye años distintos, ordena descendente, producto nunca comprado ese año no aparece en el resultado.

## Error handling

No hay casos de error nuevos: son funciones puras sobre arrays ya validados (la carga de facturas/ítems/productos ya maneja sus propios errores en `listarFacturas`/`listarItemsFactura`/`listarProductos`, como en el resto del módulo). Arrays vacíos o años sin datos producen resultados en 0 / listas vacías, nunca excepciones.
