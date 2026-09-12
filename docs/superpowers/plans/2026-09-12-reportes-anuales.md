# Reportes Anuales y Ranking de Productos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar a `/reportes` un análisis por año calendario (gasto por trimestre, semana que más gastó por mes, ranking de productos por cantidad comprada) y, al dashboard, dos tarjetas con el gasto de la semana y el mes en curso.

**Architecture:** Cuatro funciones puras nuevas en `lib/data/reportes.ts`, testeadas con Vitest sobre datos mock (mismo patrón que las funciones ya existentes en ese archivo). La UI de `/reportes` agrega un selector de año y tres secciones nuevas; el dashboard agrega dos `StatShell`. Sin cambios de esquema ni de Supabase — todo el cálculo ocurre en el cliente sobre los arrays que las páginas ya cargan.

**Tech Stack:** Next.js (App Router, `'use client'`), React, TypeScript, Vitest, Tailwind (clases utilitarias existentes del proyecto).

**Spec:** `docs/superpowers/specs/2026-09-12-reportes-anuales-design.md`

## Global Constraints

- Cálculo en el cliente sobre arrays ya cargados — nada de agregación en Postgres ni nuevas funciones RPC.
- Funciones puras y determinísticas; los tests nunca usan `new Date()` implícito, siempre pasan `anio`/`hoy` explícito.
- Ranking de productos por **cantidad** (`item.cantidad`), no por monto.
- Trimestres calendario fijos (Q1 ene-mar … Q4 oct-dic), sin opción de estaciones del año.
- Sin selector de rango personalizable ni comparación de dos años a la vez — un año calendario por vez.
- Seguir el estilo ya existente en `lib/data/reportes.ts` (nombres en español, JSDoc solo cuando algo no es obvio, `parseFechaLocal` para evitar el bug de timezone ya documentado en el archivo).

---

### Task 1: `anosConFacturas`

**Files:**
- Modify: `lib/data/reportes.ts` (agregar función, después de `calcularComprobantesPorRama` y antes de `inicioSemana`, o al final del archivo — cualquiera de las dos ubicaciones es válida, el archivo no tiene un orden estricto)
- Test: `lib/data/reportes.test.ts`

**Interfaces:**
- Produces: `anosConFacturas(facturas: FacturaCompra[]): number[]` — años (`fecha.getFullYear()`) presentes en `facturas`, sin duplicados, orden descendente. Usa la función `parseFechaLocal` ya existente en el archivo (no exportada, pero está en el mismo módulo).

- [ ] **Step 1: Write the failing tests**

Agregar al final de `lib/data/reportes.test.ts`:

```ts
describe('anosConFacturas', () => {
  it('returns distinct years present in the invoices, descending', () => {
    const facturas = [
      factura('p1', 100, 'cargada', '2025-03-01'),
      factura('p1', 200, 'cargada', '2026-01-15'),
      factura('p1', 300, 'cargada', '2025-11-20'),
    ]
    expect(anosConFacturas(facturas)).toEqual([2026, 2025])
  })

  it('returns an empty array when there are no invoices', () => {
    expect(anosConFacturas([])).toEqual([])
  })
})
```

Actualizar el import al tope del archivo para incluir `anosConFacturas`:

```ts
import {
  calcularGastoPorProveedor,
  calcularValorStock,
  calcularGastoPorSemana,
  inicioSemana,
  calcularGastoPorMes,
  calcularGastoPorDiaSemana,
  calcularCapitalEnRiesgoPorRama,
  calcularGastoPorProveedorPorRama,
  calcularComprobantesPorRama,
  anosConFacturas,
} from './reportes'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- reportes.test.ts`
Expected: FAIL — `anosConFacturas is not defined` (o error de import, `anosConFacturas` no existe en `./reportes`).

- [ ] **Step 3: Implement `anosConFacturas`**

Agregar en `lib/data/reportes.ts`:

```ts
export function anosConFacturas(facturas: FacturaCompra[]): number[] {
  const anios = new Set(facturas.map((f) => parseFechaLocal(f.fecha).getFullYear()))
  return Array.from(anios).sort((a, b) => b - a)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- reportes.test.ts`
Expected: PASS — todos los tests, incluidos los 2 nuevos de `anosConFacturas`.

- [ ] **Step 5: Commit**

```bash
git add lib/data/reportes.ts lib/data/reportes.test.ts
git commit -m "feat: agregar anosConFacturas para el selector de año en reportes"
```

---

### Task 2: `calcularGastoPorTrimestre`

**Files:**
- Modify: `lib/data/reportes.ts`
- Test: `lib/data/reportes.test.ts`

**Interfaces:**
- Produces: `calcularGastoPorTrimestre(facturas: FacturaCompra[], anio: number): { trimestre: 'Q1' | 'Q2' | 'Q3' | 'Q4'; total: number }[]` — siempre 4 entradas en orden Q1→Q4.

- [ ] **Step 1: Write the failing tests**

Agregar a `lib/data/reportes.test.ts`:

```ts
describe('calcularGastoPorTrimestre', () => {
  it('sums non-annulled invoice totals into the 4 calendar quarters of the given year', () => {
    const facturas = [
      factura('p1', 100, 'cargada', '2026-01-10'), // Q1
      factura('p1', 200, 'cargada', '2026-03-31'), // Q1 (límite)
      factura('p1', 300, 'cargada', '2026-04-01'), // Q2 (límite)
      factura('p1', 400, 'cargada', '2026-07-15'), // Q3
      factura('p1', 500, 'cargada', '2026-12-25'), // Q4
      factura('p1', 9999, 'anulada', '2026-01-10'), // excluida
    ]
    expect(calcularGastoPorTrimestre(facturas, 2026)).toEqual([
      { trimestre: 'Q1', total: 300 },
      { trimestre: 'Q2', total: 300 },
      { trimestre: 'Q3', total: 400 },
      { trimestre: 'Q4', total: 500 },
    ])
  })

  it('excludes invoices from other years', () => {
    const facturas = [factura('p1', 1000, 'cargada', '2025-02-01')]
    expect(calcularGastoPorTrimestre(facturas, 2026)).toEqual([
      { trimestre: 'Q1', total: 0 },
      { trimestre: 'Q2', total: 0 },
      { trimestre: 'Q3', total: 0 },
      { trimestre: 'Q4', total: 0 },
    ])
  })

  it('returns all quarters at zero when there are no invoices', () => {
    expect(calcularGastoPorTrimestre([], 2026)).toEqual([
      { trimestre: 'Q1', total: 0 },
      { trimestre: 'Q2', total: 0 },
      { trimestre: 'Q3', total: 0 },
      { trimestre: 'Q4', total: 0 },
    ])
  })
})
```

Agregar `calcularGastoPorTrimestre` al import de `./reportes` en el test.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- reportes.test.ts`
Expected: FAIL — `calcularGastoPorTrimestre is not defined`.

- [ ] **Step 3: Implement `calcularGastoPorTrimestre`**

Agregar en `lib/data/reportes.ts`:

```ts
type Trimestre = 'Q1' | 'Q2' | 'Q3' | 'Q4'
const TRIMESTRES: Trimestre[] = ['Q1', 'Q2', 'Q3', 'Q4']

function trimestreDeMes(mesIndiceCero: number): Trimestre {
  return TRIMESTRES[Math.floor(mesIndiceCero / 3)]
}

export function calcularGastoPorTrimestre(
  facturas: FacturaCompra[],
  anio: number
): { trimestre: Trimestre; total: number }[] {
  const totales = new Map<Trimestre, number>(TRIMESTRES.map((t) => [t, 0]))
  for (const f of facturas) {
    if (f.estado === 'anulada') continue
    const fecha = parseFechaLocal(f.fecha)
    if (fecha.getFullYear() !== anio) continue
    const trimestre = trimestreDeMes(fecha.getMonth())
    totales.set(trimestre, (totales.get(trimestre) ?? 0) + f.total)
  }
  return TRIMESTRES.map((trimestre) => ({ trimestre, total: totales.get(trimestre) ?? 0 }))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- reportes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/data/reportes.ts lib/data/reportes.test.ts
git commit -m "feat: agregar calcularGastoPorTrimestre"
```

---

### Task 3: `calcularSemanaGanadoraPorMes`

**Files:**
- Modify: `lib/data/reportes.ts`
- Test: `lib/data/reportes.test.ts`

**Interfaces:**
- Produces: `calcularSemanaGanadoraPorMes(facturas: FacturaCompra[], anio: number): { mes: string; semana: number; total: number }[]` — 12 entradas (`mes` formato `'YYYY-MM'`), `semana` 1–5 (0 si el mes no tiene facturas), `total` el gasto de esa semana ganadora.

- [ ] **Step 1: Write the failing tests**

Agregar a `lib/data/reportes.test.ts`:

```ts
describe('calcularSemanaGanadoraPorMes', () => {
  it('picks the week with the highest spend within a month that has data in several weeks', () => {
    const facturas = [
      factura('p1', 100, 'cargada', '2026-03-02'), // semana 1
      factura('p1', 900, 'cargada', '2026-03-10'), // semana 2 (gana)
      factura('p1', 300, 'cargada', '2026-03-11'), // semana 2 (suma con la anterior)
      factura('p1', 500, 'cargada', '2026-03-20'), // semana 3
    ]
    const resultado = calcularSemanaGanadoraPorMes(facturas, 2026)
    const marzo = resultado.find((r) => r.mes === '2026-03')
    expect(marzo).toEqual({ mes: '2026-03', semana: 2, total: 1200 })
  })

  it('returns semana 0 for a month with no invoices', () => {
    const resultado = calcularSemanaGanadoraPorMes([], 2026)
    expect(resultado).toHaveLength(12)
    expect(resultado.every((r) => r.semana === 0 && r.total === 0)).toBe(true)
    expect(resultado.map((r) => r.mes)).toEqual([
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
      '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
    ])
  })

  it('places days 29-31 in week 5', () => {
    const facturas = [factura('p1', 700, 'cargada', '2026-08-30')]
    const resultado = calcularSemanaGanadoraPorMes(facturas, 2026)
    const agosto = resultado.find((r) => r.mes === '2026-08')
    expect(agosto).toEqual({ mes: '2026-08', semana: 5, total: 700 })
  })

  it('excludes annulled invoices and invoices from other years', () => {
    const facturas = [
      factura('p1', 9999, 'anulada', '2026-05-05'),
      factura('p1', 300, 'cargada', '2025-05-05'),
    ]
    const resultado = calcularSemanaGanadoraPorMes(facturas, 2026)
    const mayo = resultado.find((r) => r.mes === '2026-05')
    expect(mayo).toEqual({ mes: '2026-05', semana: 0, total: 0 })
  })
})
```

Agregar `calcularSemanaGanadoraPorMes` al import de `./reportes` en el test.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- reportes.test.ts`
Expected: FAIL — `calcularSemanaGanadoraPorMes is not defined`.

- [ ] **Step 3: Implement `calcularSemanaGanadoraPorMes`**

Agregar en `lib/data/reportes.ts`:

```ts
function semanaDelMes(diaDelMes: number): number {
  return Math.min(5, Math.ceil(diaDelMes / 7))
}

export function calcularSemanaGanadoraPorMes(
  facturas: FacturaCompra[],
  anio: number
): { mes: string; semana: number; total: number }[] {
  const semanasPorMes = new Map<string, number[]>()
  for (let mes = 0; mes < 12; mes++) {
    semanasPorMes.set(`${anio}-${String(mes + 1).padStart(2, '0')}`, [0, 0, 0, 0, 0])
  }
  const mesesConFacturas = new Set<string>()
  for (const f of facturas) {
    if (f.estado === 'anulada') continue
    const fecha = parseFechaLocal(f.fecha)
    if (fecha.getFullYear() !== anio) continue
    const clave = `${anio}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
    const semanas = semanasPorMes.get(clave)
    if (!semanas) continue
    semanas[semanaDelMes(fecha.getDate()) - 1] += f.total
    mesesConFacturas.add(clave)
  }
  return Array.from(semanasPorMes.entries()).map(([mes, semanas]) => {
    if (!mesesConFacturas.has(mes)) return { mes, semana: 0, total: 0 }
    const total = Math.max(...semanas)
    return { mes, semana: semanas.indexOf(total) + 1, total }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- reportes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/data/reportes.ts lib/data/reportes.test.ts
git commit -m "feat: agregar calcularSemanaGanadoraPorMes"
```

---

### Task 4: `calcularProductosMasComprados`

**Files:**
- Modify: `lib/data/reportes.ts`
- Modify: `lib/data/reportes.test.ts` (extender el helper `itemFactura` para poder fijar `cantidad`)

**Interfaces:**
- Consumes: `enriquecerItems` (función privada ya existente en `lib/data/reportes.ts`, firma `(items: ItemFactura[], facturas: FacturaCompra[], productos: Producto[]) => { item: ItemFactura; factura: FacturaCompra; rama: Rama | null }[]`, ya excluye facturas anuladas).
- Produces: `calcularProductosMasComprados(items: ItemFactura[], facturas: FacturaCompra[], productos: Producto[], anio: number): { producto: string; cantidad: number }[]` — ordenado descendente por `cantidad`; productos sin compras ese año no aparecen.

- [ ] **Step 1: Extend the `itemFactura` test helper to accept a custom `cantidad`**

En `lib/data/reportes.test.ts`, reemplazar la función `itemFactura` actual:

```ts
function itemFactura(
  facturaId: string,
  productoId: string,
  subtotal: number,
  id = crypto.randomUUID()
): ItemFactura {
  return {
    id,
    factura_id: facturaId,
    producto_id: productoId,
    cantidad: 1,
    costo_unitario: subtotal,
    alicuota_iva: 21,
    subtotal,
  }
}
```

por esta versión, que agrega un cuarto parámetro opcional con `cantidad` (todos los call sites existentes siguen funcionando porque no pasan un 4º argumento):

```ts
function itemFactura(
  facturaId: string,
  productoId: string,
  subtotal: number,
  opciones?: { id?: string; cantidad?: number }
): ItemFactura {
  return {
    id: opciones?.id ?? crypto.randomUUID(),
    factura_id: facturaId,
    producto_id: productoId,
    cantidad: opciones?.cantidad ?? 1,
    costo_unitario: subtotal,
    alicuota_iva: 21,
    subtotal,
  }
}
```

- [ ] **Step 2: Run the full test suite to confirm the helper change doesn't break existing tests**

Run: `npm test -- reportes.test.ts`
Expected: PASS — todos los tests previos (ninguno pasaba un 4º argumento posicional, así que el cambio de firma es seguro).

- [ ] **Step 3: Write the failing tests for `calcularProductosMasComprados`**

Agregar a `lib/data/reportes.test.ts`:

```ts
describe('calcularProductosMasComprados', () => {
  it('sums item quantities per product for the given year, sorted descending', () => {
    const productoA = producto(0, 0, { id: 'prod-a' })
    const productoB = producto(0, 0, { id: 'prod-b' })
    const productos = [
      { ...productoA, nombre: 'Producto A' },
      { ...productoB, nombre: 'Producto B' },
    ]
    const facturaA = factura('p1', 100, 'cargada', '2026-02-01')
    const items = [
      itemFactura(facturaA.id, 'prod-a', 50, { cantidad: 3 }),
      itemFactura(facturaA.id, 'prod-a', 50, { cantidad: 2 }),
      itemFactura(facturaA.id, 'prod-b', 100, { cantidad: 1 }),
    ]
    const resultado = calcularProductosMasComprados(items, [facturaA], productos, 2026)
    expect(resultado).toEqual([
      { producto: 'Producto A', cantidad: 5 },
      { producto: 'Producto B', cantidad: 1 },
    ])
  })

  it('excludes annulled invoices and invoices from other years', () => {
    const productos = [producto(0, 0, { id: 'prod-a' })]
    const facturaAnulada = factura('p1', 100, 'anulada', '2026-02-01')
    const facturaOtroAnio = factura('p1', 100, 'cargada', '2025-02-01')
    const items = [
      itemFactura(facturaAnulada.id, 'prod-a', 50, { cantidad: 10 }),
      itemFactura(facturaOtroAnio.id, 'prod-a', 50, { cantidad: 10 }),
    ]
    const resultado = calcularProductosMasComprados(
      items,
      [facturaAnulada, facturaOtroAnio],
      productos,
      2026
    )
    expect(resultado).toEqual([])
  })

  it('omits products with no purchases that year instead of listing them at 0', () => {
    const productos = [producto(0, 0, { id: 'prod-a' }), producto(0, 0, { id: 'prod-sin-compras' })]
    const facturaA = factura('p1', 100, 'cargada', '2026-02-01')
    const items = [itemFactura(facturaA.id, 'prod-a', 100, { cantidad: 4 })]
    const resultado = calcularProductosMasComprados(items, [facturaA], productos, 2026)
    expect(resultado).toEqual([{ producto: 'x', cantidad: 4 }])
  })
})
```

Agregar `calcularProductosMasComprados` al import de `./reportes` en el test.

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test -- reportes.test.ts`
Expected: FAIL — `calcularProductosMasComprados is not defined`.

- [ ] **Step 5: Implement `calcularProductosMasComprados`**

Agregar en `lib/data/reportes.ts`:

```ts
export function calcularProductosMasComprados(
  items: ItemFactura[],
  facturas: FacturaCompra[],
  productos: Producto[],
  anio: number
): { producto: string; cantidad: number }[] {
  const productoPorId = new Map(productos.map((p) => [p.id, p]))
  const cantidadPorProducto = new Map<string, number>()
  for (const { item, factura } of enriquecerItems(items, facturas, productos)) {
    if (parseFechaLocal(factura.fecha).getFullYear() !== anio) continue
    cantidadPorProducto.set(
      item.producto_id,
      (cantidadPorProducto.get(item.producto_id) ?? 0) + item.cantidad
    )
  }
  return Array.from(cantidadPorProducto.entries())
    .map(([productoId, cantidad]) => ({
      producto: productoPorId.get(productoId)?.nombre ?? 'Desconocido',
      cantidad,
    }))
    .sort((a, b) => b.cantidad - a.cantidad)
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- reportes.test.ts`
Expected: PASS — los 3 tests nuevos y todos los anteriores.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS — ningún otro archivo de test se ve afectado (el helper `itemFactura` solo se usa en `reportes.test.ts`).

- [ ] **Step 8: Commit**

```bash
git add lib/data/reportes.ts lib/data/reportes.test.ts
git commit -m "feat: agregar calcularProductosMasComprados"
```

---

### Task 5: Dashboard — tarjetas de gasto semanal y mensual

**Files:**
- Modify: `app/(app)/page.tsx`

**Interfaces:**
- Consumes: `calcularGastoPorSemana(facturas: FacturaCompra[], semanas: number): { semana: string; total: number }[]` (ya existente, ya importada), `calcularGastoPorMes(facturas: FacturaCompra[], meses: number): { mes: string; total: number }[]` (ya existente, **no** importada todavía en este archivo — hay que agregarla al import).
- Produces: nada nuevo para otras tasks — es la última pieza de UI de este plan que toca `page.tsx`.

- [ ] **Step 1: Add `calcularGastoPorMes` to the existing import**

En `app/(app)/page.tsx`, el bloque de import de `@/lib/data/reportes` (alrededor de la línea 10) queda:

```ts
import {
  calcularValorStock,
  calcularGastoPorSemana,
  calcularGastoPorMes,
  calcularCapitalEnRiesgoPorRama,
  calcularGastoPorProveedorPorRama,
  calcularComprobantesPorRama,
  RAMAS,
} from '@/lib/data/reportes'
```

- [ ] **Step 2: Compute the two new figures**

En `app/(app)/page.tsx`, justo debajo de la línea `const semanas = calcularGastoPorSemana(facturas, 8)` (dentro de `DashboardPage`, después de calcular `productosStockBajo` y `ultimasFacturas`), agregar:

```ts
const gastoSemanaActual = calcularGastoPorSemana(facturas, 1)[0]?.total ?? 0
const gastoMesActual = calcularGastoPorMes(facturas, 1)[0]?.total ?? 0
```

- [ ] **Step 3: Render the two new cards**

En el JSX de `DashboardPage`, dentro del bloque `{esAdmin && (...)}`, inmediatamente después del `</div>` que cierra el primer `<div className="grid grid-cols-1 gap-5 sm:grid-cols-3">` (el que contiene "Valor total del stock", "Facturas cargadas", "Productos bajo mínimo") y antes del segundo grid (`lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]`), insertar:

```tsx
<div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
  <StatShell
    eyebrow="Gastado esta semana"
    value={`$${gastoSemanaActual.toLocaleString('es-AR')}`}
    href="/reportes"
  />
  <StatShell
    eyebrow="Gastado este mes"
    value={`$${gastoMesActual.toLocaleString('es-AR')}`}
    href="/reportes"
  />
</div>
```

- [ ] **Step 4: Run the type checker**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos relacionados a `app/(app)/page.tsx`.

- [ ] **Step 5: Visual check in the browser**

Levantar el dev server (`npm run dev` o el preview configurado), entrar al dashboard logueado como administrador, y confirmar que aparecen las dos tarjetas nuevas "Gastado esta semana" y "Gastado este mes" con un valor en pesos, y que al hacer click llevan a `/reportes`.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/page.tsx"
git commit -m "feat: agregar tarjetas de gasto semanal y mensual al dashboard"
```

---

### Task 6: `/reportes` — sección "Análisis anual"

**Files:**
- Modify: `app/(app)/reportes/page.tsx`

**Interfaces:**
- Consumes: `listarItemsFactura(): Promise<ItemFactura[]>` (ya existe en `lib/data/facturas.ts`, usada en el dashboard, no todavía en esta página); `anosConFacturas`, `calcularGastoPorTrimestre`, `calcularSemanaGanadoraPorMes`, `calcularProductosMasComprados` (Tasks 1–4); componente local `GraficoBarras` ya existente en este mismo archivo.

- [ ] **Step 1: Import what's needed**

En `app/(app)/reportes/page.tsx`, actualizar los imports del tope del archivo:

```ts
import { listarFacturas, listarItemsFactura } from '@/lib/data/facturas'
import { listarProveedores } from '@/lib/data/proveedores'
import { listarProductos } from '@/lib/data/productos'
import {
  calcularGastoPorProveedor,
  calcularValorStock,
  calcularGastoPorSemana,
  calcularGastoPorMes,
  calcularGastoPorDiaSemana,
  anosConFacturas,
  calcularGastoPorTrimestre,
  calcularSemanaGanadoraPorMes,
  calcularProductosMasComprados,
} from '@/lib/data/reportes'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import { SkeletonPage, SkeletonStatCards, SkeletonTable } from '@/components/Skeleton'
import type { FacturaCompra, Proveedor, Producto, ItemFactura } from '@/types/database'
```

- [ ] **Step 2: Load `items` and add the selected-year state**

En `ReportesPage`, agregar el estado de items y el año elegido, y cargar los items en el `useEffect` existente:

```ts
export default function ReportesPage() {
  const esAdmin = useEsAdministrador()
  const [facturas, setFacturas] = useState<FacturaCompra[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [items, setItems] = useState<ItemFactura[]>([])
  const [anioSeleccionado, setAnioSeleccionado] = useState<number | null>(null)

  useEffect(() => {
    listarFacturas().then(setFacturas)
    listarProveedores().then(setProveedores)
    listarProductos().then(setProductos)
    listarItemsFactura().then(setItems)
  }, [])
```

- [ ] **Step 3: Compute the year list and the three new datasets**

Justo debajo de `const datosPorDiaSemana = ...` (antes del `return`), agregar:

```ts
const anios = anosConFacturas(facturas)
const anioActivo = anioSeleccionado ?? anios[0] ?? new Date().getFullYear()
const opcionesAnio = anios.length > 0 ? anios : [anioActivo]

const datosPorTrimestre = calcularGastoPorTrimestre(facturas, anioActivo).map((t) => ({
  etiqueta: t.trimestre,
  total: t.total,
}))
const semanaGanadoraPorMes = calcularSemanaGanadoraPorMes(facturas, anioActivo)
const productosRanking = calcularProductosMasComprados(items, facturas, productos, anioActivo)
const masComprados = productosRanking.slice(0, 10)
const menosComprados = productosRanking.slice(-10)
```

- [ ] **Step 4: Render the "Análisis anual" section**

Al final del `return`, justo antes del `</div>` que cierra el contenedor principal (después del último `<GraficoBarras titulo="Gasto por día de la semana" ... />`), agregar:

```tsx
<div className="flex items-center justify-between rise">
  <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
    Análisis anual
  </p>
  <select
    value={anioActivo}
    onChange={(e) => setAnioSeleccionado(Number(e.target.value))}
    className="rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none focus:border-accent"
  >
    {opcionesAnio.map((a) => (
      <option key={a} value={a}>
        {a}
      </option>
    ))}
  </select>
</div>

<GraficoBarras titulo="Gasto por trimestre" subtitulo={String(anioActivo)} datos={datosPorTrimestre} />

<div className="shell rise overflow-x-auto">
  <div className="core">
    <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
      Semana que más gastó, por mes
    </p>
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b-2 border-line-strong text-left">
          <th className="px-3 py-2 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
            Mes
          </th>
          <th className="px-3 py-2 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
            Semana ganadora
          </th>
          <th className="px-3 py-2 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
            Total
          </th>
        </tr>
      </thead>
      <tbody>
        {semanaGanadoraPorMes.map((s) => (
          <tr key={s.mes} className="border-b border-line last:border-0">
            <td className="px-3 py-2 text-ink">{NOMBRES_MES[Number(s.mes.slice(5, 7)) - 1]}</td>
            <td className="mono px-3 py-2 text-ink-soft">
              {s.semana === 0 ? '—' : `Semana ${s.semana}`}
            </td>
            <td className="mono px-3 py-2 text-ink">
              {s.semana === 0 ? '—' : `$${s.total.toLocaleString('es-AR')}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>

<div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
  <div className="shell rise">
    <div className="core">
      <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        Productos más comprados
      </p>
      <ul className="divide-y divide-line">
        {masComprados.map((p, i) => (
          <li key={`${p.producto}-${i}`} className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-ink">{p.producto}</span>
            <span className="mono font-semibold text-ink">{p.cantidad}</span>
          </li>
        ))}
        {masComprados.length === 0 && (
          <li className="py-2.5 text-sm text-ink-faint">Sin compras en {anioActivo}.</li>
        )}
      </ul>
    </div>
  </div>

  <div className="shell rise">
    <div className="core">
      <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        Productos menos comprados
      </p>
      <ul className="divide-y divide-line">
        {menosComprados.map((p, i) => (
          <li key={`${p.producto}-${i}`} className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-ink">{p.producto}</span>
            <span className="mono text-ink-soft">{p.cantidad}</span>
          </li>
        ))}
        {menosComprados.length === 0 && (
          <li className="py-2.5 text-sm text-ink-faint">Sin compras en {anioActivo}.</li>
        )}
      </ul>
    </div>
  </div>
</div>
```

- [ ] **Step 5: Run the type checker**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos relacionados a `app/(app)/reportes/page.tsx`.

- [ ] **Step 6: Visual check in the browser**

Levantar el dev server, entrar a `/reportes` logueado como administrador, y confirmar:
- Aparece el selector de año con al menos un año, y el gráfico de trimestres cambia al elegir otro año.
- La tabla "Semana que más gastó, por mes" muestra 12 filas, con "—" en los meses sin facturas.
- Las dos listas de productos muestran nombre y cantidad, o el mensaje de "Sin compras" si no hay datos ese año.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/reportes/page.tsx"
git commit -m "feat: agregar analisis anual (trimestres, semana ganadora, ranking de productos) a /reportes"
```

---

## Self-Review Notes

- **Cobertura del spec:** dashboard (Task 5) ✓, `anosConFacturas` (Task 1) ✓, `calcularGastoPorTrimestre` (Task 2) ✓, `calcularSemanaGanadoraPorMes` (Task 3) ✓, `calcularProductosMasComprados` (Task 4) ✓, UI de `/reportes` con selector + 3 secciones (Task 6) ✓. Sin agregación en Postgres, sin selector multi-año, sin ranking por monto — todo respetado.
- **Placeholders:** ninguno — cada step tiene código completo, sin "TBD" ni "similar a la Task N".
- **Consistencia de tipos:** `anosConFacturas`, `calcularGastoPorTrimestre`, `calcularSemanaGanadoraPorMes` y `calcularProductosMasComprados` se usan en Task 6 con exactamente las firmas definidas en Tasks 1–4. El helper `itemFactura` cambia de firma en Task 4 (Step 1) antes de que ningún test nuevo lo use con el 4º parámetro.
