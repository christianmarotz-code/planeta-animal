# Analítica de Gastos por Período Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar a la página `/reportes` de Planeta Animal gráficos de gasto en compras por mes, por semana y por día de la semana, para que el cliente vea patrones y estacionalidad en su gasto.

**Architecture:** Dos funciones puras nuevas en `lib/data/reportes.ts` (mismo patrón TDD que las 4 funciones ya existentes ahí) calculan los totales agrupados; `app/(app)/reportes/page.tsx` las consume y renderiza 3 gráficos de barras reutilizando el estilo visual ya implementado en el dashboard (`app/(app)/page.tsx`).

**Tech Stack:** Next.js 16 (App Router, TypeScript), Vitest, Tailwind CSS v4 (design tokens del sistema "Bento" ya aplicado).

**Spec:** `docs/superpowers/specs/2026-09-09-analitica-gastos-periodo-design.md`

## Global Constraints

- Ventana de "Gasto por mes": últimos 12 meses exactos, sin selector de rango.
- Ventana de "Gasto por semana": últimas 12 semanas (la página `/reportes` usa 12, distinto de las 8 semanas que muestra el dashboard — son llamadas independientes a la misma función `calcularGastoPorSemana`).
- Ventana de "Gasto por día de la semana": agregado sobre los últimos 12 meses (misma ventana que el gráfico mensual).
- No agregar ningún KPI de texto para "mes de mayor/menor gasto" — la barra más alta/baja del gráfico ya lo comunica visualmente.
- Ninguna métrica de ventas o productos más/menos vendidos — el sistema no tiene datos de Ventas (Fase 2, no implementada). Fuera de alcance total.
- Todas las funciones de cálculo excluyen facturas con `estado === 'anulada'`.
- Las fechas de facturas (`fecha: 'YYYY-MM-DD'`) se parsean con la función privada `parseFechaLocal` ya existente en `lib/data/reportes.ts:34-37` — nunca con `new Date(string)` directo, para evitar el bug de timezone ya corregido (UTC-3 corría la fecha un día hacia atrás).
- Toda función de agrupación temporal nueva recibe `hoy: Date = new Date()` como último parámetro opcional, igual que `calcularGastoPorSemana` — así los tests son deterministas.
- Los tests nunca dependen de `new Date()` implícito: siempre pasan un `hoy` fijo explícito.
- Los gráficos de barras reutilizan exactamente las clases visuales ya usadas en el dashboard (`app/(app)/page.tsx:118-125`): contenedor `shell rise` / `core`, barras `w-full rounded-t-[8px] bg-accent transition-[height] duration-500` con altura `Math.max(4, (total / máximo) * 100)%`, etiqueta `mono text-[10px] text-ink-faint` debajo de cada barra.

---

## Estado actual de los archivos relevantes

**`lib/data/reportes.ts`** (62 líneas) ya contiene:
- `calcularGastoPorProveedor(facturas, proveedores)`
- `calcularValorStock(productos)`
- `inicioSemana(fecha: Date): string` (exportada)
- `parseFechaLocal(fecha: string): Date` (privada, NO exportada — línea 34-37)
- `calcularGastoPorSemana(facturas, semanas, hoy = new Date())`

**`lib/data/reportes.test.ts`** (139 líneas) ya contiene el helper `factura(proveedorId, total, estado = 'cargada', fecha = '2026-09-01')` — acepta fecha como 4to parámetro opcional. Y el helper `proveedor(id, nombre)`. Ambos se reutilizan sin modificar en las tareas nuevas.

**`app/(app)/reportes/page.tsx`** (89 líneas) — página cliente que carga facturas/proveedores/productos con `useEffect`, y renderiza: valor de stock, gasto por proveedor (lista), stock bajo (lista). No importa ninguna función de agrupación temporal todavía.

**`app/(app)/page.tsx`** (dashboard) — contiene el patrón visual de gráfico de barras ya implementado (líneas 106-130) que se reutiliza tal cual en esta feature.

---

### Task 1: `calcularGastoPorMes` en lib/data/reportes.ts

**Files:**
- Modify: `lib/data/reportes.ts` (agregar función nueva al final del archivo)
- Test: `lib/data/reportes.test.ts` (agregar describe-block al final del archivo)

**Interfaces:**
- Consumes: `parseFechaLocal(fecha: string): Date` (privada, ya existe en `lib/data/reportes.ts:34-37`); tipo `FacturaCompra` de `@/types/database` (ya importado en el archivo).
- Produces: `calcularGastoPorMes(facturas: FacturaCompra[], meses: number, hoy?: Date): { mes: string; total: number }[]` — `mes` con formato `'YYYY-MM'`. Task 3 la consume.

- [ ] **Step 1: Escribir los tests que van a fallar**

Agregar al final de `lib/data/reportes.test.ts` (después del último `describe('calcularGastoPorSemana', ...)` que termina en la línea 138):

```ts
describe('calcularGastoPorMes', () => {
  it('sums non-annulled invoice totals into monthly buckets anchored to a reference date', () => {
    const hoy = new Date('2026-09-09T12:00:00') // Septiembre
    const facturas = [
      factura('p1', 1000, 'cargada', '2026-09-05'), // este mes
      factura('p1', 500, 'cargada', '2026-08-15'), // mes anterior
      factura('p1', 9999, 'anulada', '2026-09-05'), // excluida
    ]
    const result = calcularGastoPorMes(facturas, 2, hoy)
    expect(result).toEqual([
      { mes: '2026-08', total: 500 },
      { mes: '2026-09', total: 1000 },
    ])
  })

  it('returns zero-total months when there are no invoices', () => {
    const hoy = new Date('2026-09-09T12:00:00')
    const result = calcularGastoPorMes([], 3, hoy)
    expect(result).toEqual([
      { mes: '2026-07', total: 0 },
      { mes: '2026-08', total: 0 },
      { mes: '2026-09', total: 0 },
    ])
  })

  it('ignores invoices outside the requested month range', () => {
    const hoy = new Date('2026-09-09T12:00:00')
    const facturas = [factura('p1', 1000, 'cargada', '2025-01-01')]
    const result = calcularGastoPorMes(facturas, 1, hoy)
    expect(result).toEqual([{ mes: '2026-09', total: 0 }])
  })

  it('rolls back into the previous year when the reference date is in January', () => {
    const hoy = new Date('2026-01-15T12:00:00')
    const facturas = [factura('p1', 700, 'cargada', '2025-12-20')]
    const result = calcularGastoPorMes(facturas, 2, hoy)
    expect(result).toEqual([
      { mes: '2025-12', total: 700 },
      { mes: '2026-01', total: 0 },
    ])
  })
})
```

Y actualizar el import del principio del archivo (línea 2) para incluir la función nueva:

```ts
import { calcularGastoPorProveedor, calcularValorStock, calcularGastoPorSemana, inicioSemana, calcularGastoPorMes } from './reportes'
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run lib/data/reportes.test.ts`
Expected: FAIL — `calcularGastoPorMes is not a function` (o error de import) en los 4 tests nuevos. Los tests existentes (`calcularGastoPorProveedor`, `calcularValorStock`, `inicioSemana`, `calcularGastoPorSemana`) siguen en verde.

- [ ] **Step 3: Implementar `calcularGastoPorMes`**

Agregar al final de `lib/data/reportes.ts` (después de la función `calcularGastoPorSemana` que termina en la línea 61):

```ts

function claveMes(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
}

export function calcularGastoPorMes(
  facturas: FacturaCompra[],
  meses: number,
  hoy: Date = new Date()
): { mes: string; total: number }[] {
  const etiquetas: string[] = []
  const totales = new Map<string, number>()
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    const clave = claveMes(d)
    etiquetas.push(clave)
    totales.set(clave, 0)
  }
  for (const f of facturas) {
    if (f.estado === 'anulada') continue
    const clave = claveMes(parseFechaLocal(f.fecha))
    if (totales.has(clave)) {
      totales.set(clave, (totales.get(clave) ?? 0) + f.total)
    }
  }
  return etiquetas.map((clave) => ({ mes: clave, total: totales.get(clave) ?? 0 }))
}
```

`new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)` con `hoy.getMonth() - i` negativo (ej. enero menos 1 mes) hace que JavaScript haga rollback de año automáticamente (mes `-1` de 2026 se resuelve como diciembre de 2025) — no hace falta lógica adicional para el cruce de año.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run lib/data/reportes.test.ts`
Expected: PASS — los 4 tests nuevos de `calcularGastoPorMes` en verde, y los 9 tests anteriores siguen en verde (13 tests totales en el archivo).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/data/reportes.ts lib/data/reportes.test.ts
git commit -m "feat: agregar calcularGastoPorMes para agrupar gasto de compras por mes"
```

---

### Task 2: `calcularGastoPorDiaSemana` en lib/data/reportes.ts

**Files:**
- Modify: `lib/data/reportes.ts` (agregar función nueva al final del archivo)
- Test: `lib/data/reportes.test.ts` (agregar describe-block al final del archivo)

**Interfaces:**
- Consumes: `parseFechaLocal(fecha: string): Date` (privada, ya existe en `lib/data/reportes.ts:34-37`); tipo `FacturaCompra`.
- Produces: `calcularGastoPorDiaSemana(facturas: FacturaCompra[], meses: number, hoy?: Date): { dia: string; total: number }[]` — siempre 7 entradas, en el orden `['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']`. Task 3 la consume.

- [ ] **Step 1: Escribir los tests que van a fallar**

Agregar al final de `lib/data/reportes.test.ts` (después del `describe('calcularGastoPorMes', ...)` agregado en la Task 1):

```ts
describe('calcularGastoPorDiaSemana', () => {
  it('sums non-annulled invoice totals by day of week within the last N months', () => {
    const hoy = new Date('2026-09-09T12:00:00') // Miércoles
    const facturas = [
      factura('p1', 1000, 'cargada', '2026-09-07'), // Lunes
      factura('p1', 300, 'cargada', '2026-09-08'), // Martes
      factura('p1', 200, 'cargada', '2026-09-08'), // Martes también
      factura('p1', 9999, 'anulada', '2026-09-07'), // excluida
    ]
    const result = calcularGastoPorDiaSemana(facturas, 1, hoy)
    expect(result).toEqual([
      { dia: 'Lunes', total: 1000 },
      { dia: 'Martes', total: 500 },
      { dia: 'Miércoles', total: 0 },
      { dia: 'Jueves', total: 0 },
      { dia: 'Viernes', total: 0 },
      { dia: 'Sábado', total: 0 },
      { dia: 'Domingo', total: 0 },
    ])
  })

  it('returns all 7 days at zero when there are no invoices', () => {
    const hoy = new Date('2026-09-09T12:00:00')
    const result = calcularGastoPorDiaSemana([], 1, hoy)
    expect(result).toEqual([
      { dia: 'Lunes', total: 0 },
      { dia: 'Martes', total: 0 },
      { dia: 'Miércoles', total: 0 },
      { dia: 'Jueves', total: 0 },
      { dia: 'Viernes', total: 0 },
      { dia: 'Sábado', total: 0 },
      { dia: 'Domingo', total: 0 },
    ])
  })

  it('ignores invoices older than the requested month window', () => {
    const hoy = new Date('2026-09-09T12:00:00')
    const facturas = [factura('p1', 1000, 'cargada', '2026-01-05')] // Lunes, pero fuera de la ventana de 1 mes
    const result = calcularGastoPorDiaSemana(facturas, 1, hoy)
    expect(result).toEqual([
      { dia: 'Lunes', total: 0 },
      { dia: 'Martes', total: 0 },
      { dia: 'Miércoles', total: 0 },
      { dia: 'Jueves', total: 0 },
      { dia: 'Viernes', total: 0 },
      { dia: 'Sábado', total: 0 },
      { dia: 'Domingo', total: 0 },
    ])
  })
})
```

Y actualizar el import del principio del archivo (línea 2) para incluir la función nueva junto a `calcularGastoPorMes` agregada en la Task 1:

```ts
import { calcularGastoPorProveedor, calcularValorStock, calcularGastoPorSemana, inicioSemana, calcularGastoPorMes, calcularGastoPorDiaSemana } from './reportes'
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run lib/data/reportes.test.ts`
Expected: FAIL — `calcularGastoPorDiaSemana is not a function` en los 3 tests nuevos. El resto (13 tests de las Tasks anteriores) sigue en verde.

- [ ] **Step 3: Implementar `calcularGastoPorDiaSemana`**

Agregar al final de `lib/data/reportes.ts` (después de la función `calcularGastoPorMes` agregada en la Task 1):

```ts

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const ORDEN_LUNES_A_DOMINGO = [1, 2, 3, 4, 5, 6, 0] // índices de Date.getDay() (0 = domingo)

export function calcularGastoPorDiaSemana(
  facturas: FacturaCompra[],
  meses: number,
  hoy: Date = new Date()
): { dia: string; total: number }[] {
  const desde = new Date(hoy.getFullYear(), hoy.getMonth() - meses, hoy.getDate())
  const totalesPorIndiceJs = [0, 0, 0, 0, 0, 0, 0]
  for (const f of facturas) {
    if (f.estado === 'anulada') continue
    const fecha = parseFechaLocal(f.fecha)
    if (fecha < desde || fecha > hoy) continue
    totalesPorIndiceJs[fecha.getDay()] += f.total
  }
  return ORDEN_LUNES_A_DOMINGO.map((indiceJs, i) => ({
    dia: DIAS_SEMANA[i],
    total: totalesPorIndiceJs[indiceJs],
  }))
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run lib/data/reportes.test.ts`
Expected: PASS — 16 tests totales en el archivo (9 previos + 4 de `calcularGastoPorMes` + 3 de `calcularGastoPorDiaSemana`).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/data/reportes.ts lib/data/reportes.test.ts
git commit -m "feat: agregar calcularGastoPorDiaSemana para agrupar gasto de compras por día de la semana"
```

---

### Task 3: Gráficos en la página /reportes

**Files:**
- Modify: `app/(app)/reportes/page.tsx` (reemplazo completo del archivo — 89 líneas actuales)

**Interfaces:**
- Consumes: `calcularGastoPorMes(facturas, meses, hoy?)` y `calcularGastoPorDiaSemana(facturas, meses, hoy?)` de la Task 1 y 2; `calcularGastoPorSemana(facturas, semanas, hoy?)` ya existente en `lib/data/reportes.ts`; `calcularGastoPorProveedor` y `calcularValorStock` ya existentes y ya usadas en este archivo — no cambian.
- Produces: nada que otra task consuma — es la task final de la feature.

- [ ] **Step 1: Reemplazar el contenido completo de `app/(app)/reportes/page.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { listarFacturas } from '@/lib/data/facturas'
import { listarProveedores } from '@/lib/data/proveedores'
import { listarProductos } from '@/lib/data/productos'
import {
  calcularGastoPorProveedor,
  calcularValorStock,
  calcularGastoPorSemana,
  calcularGastoPorMes,
  calcularGastoPorDiaSemana,
} from '@/lib/data/reportes'
import type { FacturaCompra, Proveedor, Producto } from '@/types/database'

const NOMBRES_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const ABREV_DIA: Record<string, string> = {
  Lunes: 'Lun',
  Martes: 'Mar',
  Miércoles: 'Mié',
  Jueves: 'Jue',
  Viernes: 'Vie',
  Sábado: 'Sáb',
  Domingo: 'Dom',
}

function GraficoBarras({
  titulo,
  subtitulo,
  datos,
}: {
  titulo: string
  subtitulo: string
  datos: { etiqueta: string; total: number }[]
}) {
  const maximo = Math.max(1, ...datos.map((d) => d.total))
  return (
    <div className="shell rise">
      <div className="core">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            {titulo}
          </p>
          <span className="mono text-xs text-ink-faint">{subtitulo}</span>
        </div>
        <div className="flex h-36 items-end gap-3">
          {datos.map((d, i) => (
            <div key={`${d.etiqueta}-${i}`} className="flex flex-1 flex-col items-center gap-2">
              <div
                className="w-full rounded-t-[8px] bg-accent transition-[height] duration-500"
                style={{ height: `${Math.max(4, (d.total / maximo) * 100)}%` }}
                title={`$${d.total.toLocaleString('es-AR')}`}
              />
              <span className="mono text-[10px] text-ink-faint">{d.etiqueta}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ReportesPage() {
  const [facturas, setFacturas] = useState<FacturaCompra[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos, setProductos] = useState<Producto[]>([])

  useEffect(() => {
    listarFacturas().then(setFacturas)
    listarProveedores().then(setProveedores)
    listarProductos().then(setProductos)
  }, [])

  const gastoPorProveedor = calcularGastoPorProveedor(facturas, proveedores)
  const valorStock = calcularValorStock(productos)
  const productosStockBajo = productos.filter((p) => p.stock_actual <= p.stock_minimo)

  const datosPorMes = calcularGastoPorMes(facturas, 12).map((m) => ({
    etiqueta: NOMBRES_MES[Number(m.mes.slice(5, 7)) - 1],
    total: m.total,
  }))
  const datosPorSemana = calcularGastoPorSemana(facturas, 12).map((s) => ({
    etiqueta: new Date(s.semana).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
    total: s.total,
  }))
  const datosPorDiaSemana = calcularGastoPorDiaSemana(facturas, 12).map((d) => ({
    etiqueta: ABREV_DIA[d.dia],
    total: d.total,
  }))

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="rise">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Gestión
        </p>
        <h1 className="mt-1 text-[27px] text-ink">Reportes</h1>
      </div>

      <div className="shell w-fit rise">
        <div className="core">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Valor total del stock actual
          </p>
          <p className="mono mt-2 text-[40px] font-medium leading-none text-ink">
            ${valorStock.toLocaleString('es-AR')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="shell rise">
          <div className="core">
            <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Gasto en compras por proveedor
            </p>
            <ul className="divide-y divide-line">
              {gastoPorProveedor.map((g) => (
                <li key={g.proveedor} className="flex justify-between py-2.5 text-sm">
                  <span className="text-ink">{g.proveedor}</span>
                  <span className="mono font-semibold text-ink">${g.total.toLocaleString('es-AR')}</span>
                </li>
              ))}
              {gastoPorProveedor.length === 0 && (
                <li className="py-2.5 text-sm text-ink-faint">Sin compras aún.</li>
              )}
            </ul>
          </div>
        </div>

        <div className="shell rise">
          <div className="core">
            <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Productos con stock bajo
            </p>
            <ul className="divide-y divide-line">
              {productosStockBajo.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-ink">{p.nombre}</span>
                  <span className="chip down">
                    {p.stock_actual} / {p.stock_minimo} {p.unidad_stock}
                  </span>
                </li>
              ))}
              {productosStockBajo.length === 0 && (
                <li className="py-2.5 text-sm text-ink-faint">Ningún producto está bajo el mínimo.</li>
              )}
            </ul>
          </div>
        </div>
      </div>

      <GraficoBarras titulo="Gasto por mes" subtitulo="últimos 12 meses" datos={datosPorMes} />
      <GraficoBarras titulo="Gasto por semana" subtitulo="últimas 12 semanas" datos={datosPorSemana} />
      <GraficoBarras titulo="Gasto por día de la semana" subtitulo="últimos 12 meses" datos={datosPorDiaSemana} />
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Correr toda la suite de tests**

Run: `npx vitest run`
Expected: PASS — los 16 tests de `lib/data/reportes.test.ts` (Tasks 1 y 2) más todos los tests existentes de otros archivos (`lib/calc/costoReal.test.ts`, etc.) siguen en verde. Este archivo no tiene tests propios (es un componente de página, siguiendo el patrón ya establecido en el proyecto de no testear componentes React, solo funciones puras de `lib/`).

- [ ] **Step 4: Build de producción**

Run: `npm run build`
Expected: build limpio, las 16 rutas existentes se generan sin errores (incluyendo `/reportes`).

- [ ] **Step 5: Verificación manual en el navegador**

Levantar el servidor de desarrollo (`npm run dev`), navegar a `/reportes` autenticado, y confirmar:
- Aparecen 3 gráficos de barras nuevos debajo de "Gasto por proveedor" / "Stock bajo": "Gasto por mes" (12 barras, etiquetas `ene`, `feb`...), "Gasto por semana" (12 barras, etiquetas `dd/mm`), "Gasto por día de la semana" (7 barras, etiquetas `Lun`...`Dom`).
- Si no hay facturas cargadas para algún período, las barras de ese gráfico se ven en altura mínima (no rotas ni con `NaN`).
- Los `title` (tooltip al pasar el mouse) de cada barra muestran el monto correcto en formato `$...`.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/reportes/page.tsx"
git commit -m "feat: agregar gráficos de gasto por mes, semana y día de la semana a Reportes"
```

---

## Self-Review

**1. Cobertura del spec:**
- "Gasto por mes, últimos 12 meses, sin selector" → Task 1 (`calcularGastoPorMes`) + Task 3 (llamada con `12`, sin UI de selección). ✅
- "Gasto por semana, últimas 12 semanas" → Task 3 (`calcularGastoPorSemana(facturas, 12)`, función ya existente, reutilizada). ✅
- "Gasto por día de la semana, ventana de 12 meses" → Task 2 (`calcularGastoPorDiaSemana`) + Task 3 (llamada con `12`). ✅
- "Solo visual, sin KPI de texto para mes de mayor/menor gasto" → Task 3 no agrega ningún elemento de texto adicional más allá del gráfico de barras. ✅
- "Reutilizar el patrón visual de barras del dashboard" → Task 3 usa exactamente las mismas clases (`bg-accent`, `rounded-t-[8px]`, `transition-[height] duration-500`, `mono text-[10px] text-ink-faint`). ✅
- "Excluir anuladas, usar parseFechaLocal" → Tasks 1 y 2 ambas filtran `estado === 'anulada'` y usan `parseFechaLocal`. ✅
- "Fuera de alcance: ventas/productos" → ninguna task toca esa área. ✅

**2. Placeholders:** ninguno — todo el código está completo y es el código real a escribir, sin "TODO" ni "similar a la Task N" sin contenido.

**3. Consistencia de tipos:**
- `calcularGastoPorMes(facturas: FacturaCompra[], meses: number, hoy?: Date): { mes: string; total: number }[]` — mismo shape en Task 1 (definición) y Task 3 (consumo vía `m.mes`, `m.total`). ✅
- `calcularGastoPorDiaSemana(facturas: FacturaCompra[], meses: number, hoy?: Date): { dia: string; total: number }[]` — mismo shape en Task 2 (definición) y Task 3 (consumo vía `d.dia`, `d.total`, y las claves de `ABREV_DIA` coinciden exactamente con `DIAS_SEMANA`: Lunes, Martes, Miércoles, Jueves, Viernes, Sábado, Domingo). ✅
- `calcularGastoPorSemana(facturas, semanas, hoy?): { semana: string; total: number }[]` — sin cambios respecto a la firma ya existente; Task 3 la consume igual que el dashboard ya lo hace. ✅
