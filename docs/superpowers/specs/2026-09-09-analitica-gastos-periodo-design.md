# Analítica de Gastos por Período — Design Spec

**Fecha:** 2026-09-09
**Contexto:** Extensión de la página `/reportes` de Planeta Animal (veterinaria) para que el cliente pueda ver patrones de gasto en compras a lo largo del tiempo: cuánto gasta por mes, por semana, y qué día de la semana gasta más. Construido sobre `lib/data/reportes.ts`, el módulo de cálculos puros ya existente y testeado (`calcularGastoPorProveedor`, `calcularValorStock`, `calcularGastoPorSemana`, `inicioSemana`).

## Objetivo

El cliente actualmente ve, en `/reportes`, el gasto total por proveedor y el stock bajo. Quiere además identificar patrones temporales de gasto: meses de mayor/menor gasto (estacionalidad), tendencia de las últimas semanas, y qué día de la semana concentra más carga de facturas. Esta analítica es sobre **compras únicamente** (tabla `facturas_compra`) — el sistema no registra ventas todavía, así que "qué producto se vende más/menos" queda explícitamente fuera de alcance hasta una futura Fase 2 (Ventas).

## Fuera de alcance

- Cualquier métrica de ventas o rotación de productos (requiere datos de Ventas, no existentes).
- Selector de rango de fechas personalizable — el rango es fijo (ver abajo).
- KPI de texto destacando el mes de mayor/menor gasto — la barra más alta/baja del gráfico mensual ya lo comunica visualmente.

## Decisiones de rango temporal

- **Gasto por mes:** últimos 12 meses, sin selector.
- **Gasto por semana:** últimas 12 semanas (reemplaza el rango de 8 semanas usado en el dashboard; en `/reportes` se usa 12 para dar algo más de perspectiva sin volverse ilegible).
- **Gasto por día de la semana:** agregado sobre los últimos 12 meses, para ser consistente con el gráfico mensual.

## Arquitectura

**Enfoque:** cálculo en el cliente sobre datos ya cargados (mismo patrón que las funciones existentes de `lib/data/reportes.ts`), no agregación en Postgres. El volumen de facturas de una veterinaria es chico; agregar vistas o funciones SQL para esto sería complejidad innecesaria y rompería la consistencia con el resto del módulo, que ya sigue el patrón "traer todo, calcular en TS puro y testeable".

### Funciones nuevas en `lib/data/reportes.ts`

```ts
export function calcularGastoPorMes(
  facturas: FacturaCompra[],
  meses: number,
  hoy: Date = new Date()
): { mes: string; total: number }[]
```
- `mes` tiene formato `'YYYY-MM'` (ej. `'2026-07'`).
- Genera `meses` buckets consecutivos terminando en el mes de `hoy` (inclusive), inicializados en 0.
- Recorre `facturas`, excluye las con `estado === 'anulada'`, parsea `fecha` con la misma lógica de fecha-local que ya usa `calcularGastoPorSemana` (evita el bug de timezone ya corregido), y suma `total` al bucket cuyo año-mes coincide.
- Facturas fuera de la ventana de `meses` se ignoran (no se agregan a ningún bucket).

```ts
export function calcularGastoPorDiaSemana(
  facturas: FacturaCompra[],
  meses: number,
  hoy: Date = new Date()
): { dia: string; total: number }[]
```
- Devuelve siempre 7 entradas, en el orden `['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']`.
- Ventana: facturas con fecha entre `hoy` menos `meses` meses (inclusive) y `hoy` (inclusive).
- Excluye `estado === 'anulada'`.
- Agrupa por día de la semana en que fue emitida la factura (`fecha`, no fecha de carga en el sistema) y suma `total`.

Ambas funciones reciben `hoy` como parámetro opcional (default `new Date()`) — mismo patrón que `calcularGastoPorSemana` — para que los tests sean deterministas sin depender de la fecha real de ejecución.

### `lib/data/reportes.ts` — reutilización

`calcularGastoPorSemana` ya existe y no cambia de firma; `/reportes` la llama con `12` en vez del `8` que usa el dashboard.

### UI — `app/(app)/reportes/page.tsx`

Se agregan 3 secciones nuevas, cada una un componente de gráfico de barras (`shell`/`core`, ancho completo), debajo de las 2 secciones existentes (Gasto por proveedor, Stock bajo). Estilo idéntico al gráfico "Gasto por semana" ya implementado en el dashboard (`app/(app)/page.tsx`): barras `div` con altura proporcional al máximo del set, `bg-accent`, transición `duration-500`, etiqueta `mono text-[10px]` debajo de cada barra.

1. **"Gasto por mes"** — 12 barras, eje con abreviatura de mes en español (`ene`, `feb`, `mar`...).
2. **"Gasto por semana"** — 12 barras, eje con fecha corta (`dd/mm`) del inicio de cada semana — mismo formato que el dashboard.
3. **"Gasto por día de la semana"** — 7 barras, eje con inicial o abreviatura del día (`Lun`, `Mar`...).

Cada sección maneja el caso de "sin facturas en el rango" mostrando las barras en altura mínima (igual que hoy pasa en el dashboard cuando `maxSemana` es 1 por el `Math.max(1, ...)`).

## Testing

TDD, siguiendo el patrón exacto de `lib/data/reportes.test.ts`: se extiende el helper `factura()` (ya acepta `fecha` desde el refactor anterior) para construir escenarios, y se agregan describe-blocks para cada función nueva:

- `calcularGastoPorMes`: agrupa correctamente por mes, excluye anuladas, devuelve 0 en meses sin facturas, ignora facturas fuera de la ventana de N meses.
- `calcularGastoPorDiaSemana`: agrupa correctamente por día, excluye anuladas, devuelve las 7 entradas en el orden Lunes→Domingo aun sin datos, ignora facturas fuera de la ventana.

Todos los tests usan una fecha de referencia (`hoy`) fija pasada explícitamente, nunca `new Date()` implícito, para que el resultado sea reproducible sin importar cuándo corran.

## Error handling

No hay nuevos casos de error: las funciones son puras y determinísticas sobre arrays ya validados por el resto del sistema (la carga de facturas ya maneja sus propios errores en `listarFacturas`). Un array de facturas vacío simplemente produce todos los buckets en 0 — comportamiento ya cubierto por `calcularGastoPorSemana` y ahora extendido a las 2 funciones nuevas.
