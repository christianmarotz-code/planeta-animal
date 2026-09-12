# Reposición Sugerida Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una vista "Reposición sugerida" que agrupa los productos en stock bajo mínimo por su proveedor más barato (según el comparador de precios) y permite generar una compra precargada en `/compras/nueva` con un clic.

**Architecture:** Una función pura de agrupación en `lib/data/reposicion.ts` (testeada sin Supabase), una página nueva `/reposicion` que la consume y ofrece "Crear compra" por proveedor, y un traspaso vía `sessionStorage` hacia `/compras/nueva`, que detecta el borrador al montar y precarga proveedor + ítems. Sin cambios de esquema ni tablas nuevas.

**Tech Stack:** Next.js (App Router, `'use client'`), React, TypeScript, Vitest, Tailwind (clases utilitarias existentes del proyecto).

**Spec:** `docs/superpowers/specs/2026-09-12-reposicion-sugerida-design.md`

## Global Constraints

- Sin tabla nueva en la base de datos ni cambios de esquema — el traspaso a `/compras/nueva` usa `sessionStorage`, no persistencia server-side.
- Sin sistema de "reserva": generar una compra sugerida no descuenta ni marca nada; el producto sigue en la lista hasta que la compra real se cargue y el stock suba.
- Cantidad sugerida = `stock_minimo − stock_actual`, con piso en 1.
- Agrupación por proveedor más barato (`FilaComparador.mejor`); productos sin ningún precio cargado van a una lista aparte (`sinPrecio`), sin proveedor ni acción.
- No se prefilla `numero_comprobante`, `tipo_comprobante` ni `fecha` en `/compras/nueva` — esos datos vienen de la factura real.
- Seguir los patrones ya existentes: `shell`/`core`/`card`/`rise`, `useEsAdministrador`, `SkeletonPage`/`SkeletonTable`, mismo estilo de tabla que `/stock` y `/compras/nueva`.

---

### Task 1: `lib/data/reposicion.ts` — agrupación y carga de datos

**Files:**
- Create: `lib/data/reposicion.ts`
- Create: `lib/data/reposicion.test.ts`

**Interfaces:**
- Consumes: `listarProductos(filtros?: { categoria?: string; soloStockBajo?: boolean }): Promise<Producto[]>` (ya existe en `lib/data/productos.ts`); `listarComparador(): Promise<FilaComparador[]>` y `interface FilaComparador { producto: Producto; precios: { proveedor: Proveedor; precio: number; actualizadoEn: string }[]; mejor: { proveedor: Proveedor; precio: number } | null }` (ya existen en `lib/data/preciosProveedor.ts`).
- Produces: `ItemReposicion`, `PaqueteReposicion`, `ReposicionSugerida`, `BorradorReposicionItem`, `BorradorReposicion`, `REPOSICION_DRAFT_KEY`, `agruparReposicionSugerida(productos, filas)`, `listarReposicionSugerida()` — todos exportados desde `lib/data/reposicion.ts`, consumidos por las Tasks 3 y 4.

- [ ] **Step 1: Write the failing tests**

Crear `lib/data/reposicion.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { agruparReposicionSugerida } from './reposicion'
import type { FilaComparador } from './preciosProveedor'
import type { Producto, Proveedor } from '@/types/database'

function producto(id: string, stockActual: number, stockMinimo: number, nombre = 'x'): Producto {
  return {
    id,
    nombre,
    categoria: null,
    rama: null,
    unidad_compra: 'unidad',
    unidad_stock: 'unidad',
    factor_conversion: 1,
    stock_actual: stockActual,
    stock_minimo: stockMinimo,
    costo_unitario_actual: 0,
    precio_venta: 0,
    alicuota_iva: 21,
    activo: true,
    codigo: null,
    codigo_barras: null,
    created_at: '',
  }
}

function proveedor(id: string, nombre: string): Proveedor {
  return {
    id,
    nombre,
    cuit: null,
    telefono: null,
    email: null,
    direccion: null,
    notas: null,
    aplica_iibb: false,
    tasa_iibb: 0,
    aplica_perc_iva: false,
    tasa_perc_iva: 0,
    descuento_pronto_pago: 0,
    created_at: '',
  }
}

function filaComparador(
  productoRow: Producto,
  mejor: { proveedor: Proveedor; precio: number } | null
): FilaComparador {
  return {
    producto: productoRow,
    precios: mejor ? [{ proveedor: mejor.proveedor, precio: mejor.precio, actualizadoEn: '' }] : [],
    mejor,
  }
}

describe('agruparReposicionSugerida', () => {
  it('groups a low-stock product under its cheapest provider with the suggested quantity', () => {
    const p1 = producto('p1', 2, 10)
    const provA = proveedor('provA', 'Proveedor A')
    const filas = [filaComparador(p1, { proveedor: provA, precio: 100 })]

    const resultado = agruparReposicionSugerida([p1], filas)

    expect(resultado.paquetes).toEqual([
      { proveedor: provA, items: [{ producto: p1, cantidadSugerida: 8, precio: 100 }] },
    ])
    expect(resultado.sinPrecio).toEqual([])
  })

  it('floors the suggested quantity at 1 even when stock is already at or above minimum', () => {
    const p1 = producto('p1', 10, 5)
    const provA = proveedor('provA', 'Proveedor A')
    const filas = [filaComparador(p1, { proveedor: provA, precio: 50 })]

    const resultado = agruparReposicionSugerida([p1], filas)

    expect(resultado.paquetes[0].items[0].cantidadSugerida).toBe(1)
  })

  it('puts a low-stock product with no comparador price into sinPrecio', () => {
    const p1 = producto('p1', 0, 5)

    const resultado = agruparReposicionSugerida([p1], [])

    expect(resultado.paquetes).toEqual([])
    expect(resultado.sinPrecio).toEqual([p1])
  })

  it('groups two products with the same cheapest provider into one package', () => {
    const p1 = producto('p1', 0, 5)
    const p2 = producto('p2', 0, 3)
    const provA = proveedor('provA', 'Proveedor A')
    const filas = [
      filaComparador(p1, { proveedor: provA, precio: 10 }),
      filaComparador(p2, { proveedor: provA, precio: 20 }),
    ]

    const resultado = agruparReposicionSugerida([p1, p2], filas)

    expect(resultado.paquetes).toHaveLength(1)
    expect(resultado.paquetes[0].items).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- reposicion.test.ts`
Expected: FAIL — `Cannot find module './reposicion'` (el archivo todavía no existe).

- [ ] **Step 3: Implement `lib/data/reposicion.ts`**

```ts
import { listarProductos } from './productos'
import { listarComparador, type FilaComparador } from './preciosProveedor'
import type { Producto, Proveedor } from '@/types/database'

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

export const REPOSICION_DRAFT_KEY = 'reposicion-draft'

export interface BorradorReposicionItem {
  productoId: string
  cantidad: number
  costoUnitario: number
  alicuotaIva: number
}

export interface BorradorReposicion {
  proveedorId: string
  items: BorradorReposicionItem[]
}

export function agruparReposicionSugerida(
  productos: Producto[],
  filas: FilaComparador[]
): ReposicionSugerida {
  const filaPorProductoId = new Map(filas.map((f) => [f.producto.id, f]))
  const paquetesPorProveedorId = new Map<string, PaqueteReposicion>()
  const sinPrecio: Producto[] = []

  for (const producto of productos) {
    const fila = filaPorProductoId.get(producto.id)
    if (!fila || !fila.mejor) {
      sinPrecio.push(producto)
      continue
    }
    const cantidadSugerida = Math.max(1, producto.stock_minimo - producto.stock_actual)
    const item: ItemReposicion = { producto, cantidadSugerida, precio: fila.mejor.precio }
    const paqueteExistente = paquetesPorProveedorId.get(fila.mejor.proveedor.id)
    if (paqueteExistente) {
      paqueteExistente.items.push(item)
    } else {
      paquetesPorProveedorId.set(fila.mejor.proveedor.id, {
        proveedor: fila.mejor.proveedor,
        items: [item],
      })
    }
  }

  return { paquetes: Array.from(paquetesPorProveedorId.values()), sinPrecio }
}

export async function listarReposicionSugerida(): Promise<ReposicionSugerida> {
  const [productos, filas] = await Promise.all([
    listarProductos({ soloStockBajo: true }),
    listarComparador(),
  ])
  return agruparReposicionSugerida(productos, filas)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- reposicion.test.ts`
Expected: PASS — los 4 tests.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — ningún otro archivo se ve afectado (este es un módulo nuevo).

- [ ] **Step 6: Commit**

```bash
git add lib/data/reposicion.ts lib/data/reposicion.test.ts
git commit -m "feat: agregar agrupación de reposición sugerida por proveedor más barato"
```

---

### Task 2: Sidebar — ítem de navegación "Reposición"

**Files:**
- Modify: `components/Sidebar.tsx`

**Interfaces:**
- Produces: ruta `/reposicion` visible en el sidebar (bajo el grupo "Operación", junto a Compras/Stock/Comparador), consumida por la Task 3 (la página en sí).

- [ ] **Step 1: Add the icon component**

En `components/Sidebar.tsx`, agregar esta función junto a las demás `Icon*` (por ejemplo, después de `IconComparador`):

```tsx
function IconReposicion() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="1.6">
      <path d="M3.5 6.5 10 3l6.5 3.5v4a6.5 6.5 0 0 1-.3 2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 6.5 10 10l6.5-3.5M10 10v7l-6.5-3.5v-7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.5 12.5h4M16.5 10.5v4" strokeLinecap="round" />
    </svg>
  )
}
```

- [ ] **Step 2: Add the nav entry**

En el array `GRUPOS`, dentro del grupo `'Operación'`, agregar la entrada después de Comparador:

```ts
  {
    titulo: 'Operación',
    links: [
      { href: '/compras', label: 'Compras', Icono: IconCompras },
      { href: '/stock', label: 'Stock', Icono: IconStock },
      { href: '/comparador', label: 'Comparador', Icono: IconComparador, soloAdmin: true },
      { href: '/reposicion', label: 'Reposición', Icono: IconReposicion, soloAdmin: true },
    ],
  },
```

(`soloAdmin: true` porque la vista expone precios de proveedores, igual que Comparador.)

- [ ] **Step 3: Run the type checker**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos. (El link a `/reposicion` apuntará a una ruta que todavía no existe hasta la Task 3 — Next.js no falla el type-check por esto, solo daría 404 en runtime; la Task 3 la crea antes de que este cambio se use de punta a punta.)

- [ ] **Step 4: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat: agregar ítem de sidebar para Reposición"
```

---

### Task 3: `/reposicion` — página de reposición sugerida

**Files:**
- Create: `app/(app)/reposicion/page.tsx`

**Interfaces:**
- Consumes: `listarReposicionSugerida()`, `ItemReposicion`, `PaqueteReposicion`, `ReposicionSugerida`, `REPOSICION_DRAFT_KEY`, `BorradorReposicion` (Task 1); `useEsAdministrador()` (ya existe en `lib/hooks/useEsAdministrador.ts`); `SkeletonPage`/`SkeletonTable` (ya existen en `components/Skeleton.tsx`).
- Produces: al hacer clic en "Crear compra", escribe `sessionStorage[REPOSICION_DRAFT_KEY]` con la forma `BorradorReposicion` y navega a `/compras/nueva` — la Task 4 lee esa clave con esa forma exacta.

- [ ] **Step 1: Create the page**

Crear `app/(app)/reposicion/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  listarReposicionSugerida,
  REPOSICION_DRAFT_KEY,
  type BorradorReposicion,
  type ItemReposicion,
  type PaqueteReposicion,
  type ReposicionSugerida,
} from '@/lib/data/reposicion'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import { SkeletonPage, SkeletonTable } from '@/components/Skeleton'

function calcularCantidad(item: ItemReposicion, cantidades: Record<string, string>): number {
  const crudo = cantidades[item.producto.id]
  if (crudo === undefined) return item.cantidadSugerida
  const valor = Number(crudo)
  return Number.isFinite(valor) && valor > 0 ? valor : item.cantidadSugerida
}

export default function ReposicionPage() {
  const esAdmin = useEsAdministrador()
  const router = useRouter()
  const [datos, setDatos] = useState<ReposicionSugerida | null>(null)
  const [cantidades, setCantidades] = useState<Record<string, string>>({})

  useEffect(() => {
    listarReposicionSugerida().then(setDatos)
  }, [])

  if (esAdmin === null || datos === null) {
    return (
      <SkeletonPage>
        <SkeletonTable filas={6} columnas={4} />
      </SkeletonPage>
    )
  }
  if (esAdmin === false) {
    return (
      <p className="p-8 text-sm text-negative">
        Acceso restringido — contactá a un administrador.
      </p>
    )
  }

  function handleCrearCompra(paquete: PaqueteReposicion) {
    const borrador: BorradorReposicion = {
      proveedorId: paquete.proveedor.id,
      items: paquete.items.map((item) => ({
        productoId: item.producto.id,
        cantidad: calcularCantidad(item, cantidades),
        costoUnitario: item.precio,
        alicuotaIva: item.producto.alicuota_iva,
      })),
    }
    sessionStorage.setItem(REPOSICION_DRAFT_KEY, JSON.stringify(borrador))
    router.push('/compras/nueva')
  }

  const sinDatos = datos.paquetes.length === 0 && datos.sinPrecio.length === 0

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="rise">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Gestión
        </p>
        <h1 className="mt-1 text-[27px] text-ink">Reposición sugerida</h1>
      </div>

      {sinDatos && (
        <div className="card rise p-5 text-sm text-ink-faint">
          No hay productos en stock bajo mínimo.
        </div>
      )}

      {datos.paquetes.map((paquete) => {
        const subtotalPaquete = paquete.items.reduce(
          (acc, item) => acc + item.precio * calcularCantidad(item, cantidades),
          0
        )
        return (
          <div key={paquete.proveedor.id} className="card rise overflow-x-auto">
            <div className="flex items-center justify-between px-5 py-3">
              <p className="text-sm font-semibold text-ink">{paquete.proveedor.nombre}</p>
              <button onClick={() => handleCrearCompra(paquete)} className="pill-btn">
                Crear compra con {paquete.proveedor.nombre}
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-line-strong text-left">
                  <th className="px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Producto
                  </th>
                  <th className="px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Cantidad sugerida
                  </th>
                  <th className="px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Precio unitario
                  </th>
                  <th className="px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Subtotal
                  </th>
                </tr>
              </thead>
              <tbody>
                {paquete.items.map((item) => {
                  const cantidad = calcularCantidad(item, cantidades)
                  return (
                    <tr key={item.producto.id} className="border-b border-line last:border-0">
                      <td className="px-5 py-2.5 text-ink">{item.producto.nombre}</td>
                      <td className="px-5 py-2.5">
                        <input
                          type="number"
                          min={1}
                          step="any"
                          value={cantidades[item.producto.id] ?? String(item.cantidadSugerida)}
                          onChange={(e) =>
                            setCantidades((prev) => ({ ...prev, [item.producto.id]: e.target.value }))
                          }
                          className="w-20 rounded-[var(--r-sm)] border border-line bg-surface p-1.5 text-sm text-ink outline-none focus:border-accent"
                        />
                      </td>
                      <td className="mono px-5 py-2.5 text-ink-soft">
                        ${item.precio.toLocaleString('es-AR')}
                      </td>
                      <td className="mono px-5 py-2.5 text-ink">
                        ${(item.precio * cantidad).toLocaleString('es-AR')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="px-5 py-2.5 text-right text-sm font-semibold text-ink">
              Total: ${subtotalPaquete.toLocaleString('es-AR')}
            </p>
          </div>
        )
      })}

      {datos.sinPrecio.length > 0 && (
        <div className="shell rise">
          <div className="core">
            <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Sin precio cargado
            </p>
            <ul className="divide-y divide-line">
              {datos.sinPrecio.map((producto) => (
                <li key={producto.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-ink">{producto.nombre}</span>
                  <span className="chip down">
                    {producto.stock_actual} / {producto.stock_minimo} {producto.unidad_stock}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href="/comparador"
              className="mt-3 inline-block text-xs font-semibold text-accent hover:underline"
            >
              Cargar precios en el comparador →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Visual check in the browser**

Levantar el dev server, entrar a `/reposicion` logueado como administrador, y confirmar:
- Si hay productos en stock bajo con precio cargado, aparecen agrupados por proveedor, con cantidad editable y un botón "Crear compra con {proveedor}".
- Cambiar la cantidad de un ítem actualiza el subtotal de esa fila y el total del paquete.
- Los productos en stock bajo sin precio cargado aparecen en el bloque "Sin precio cargado" con link a `/comparador`.
- Si no hay ningún producto en stock bajo, se ve el mensaje "No hay productos en stock bajo mínimo".

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/reposicion/page.tsx"
git commit -m "feat: agregar página de reposición sugerida"
```

---

### Task 4: `/compras/nueva` — precargar desde el borrador de reposición

**Files:**
- Modify: `app/(app)/compras/nueva/page.tsx`

**Interfaces:**
- Consumes: `REPOSICION_DRAFT_KEY`, `BorradorReposicion` (Task 1) — la forma exacta escrita por la Task 3 (`{ proveedorId: string; items: { productoId: string; cantidad: number; costoUnitario: number; alicuotaIva: number }[] }`).

- [ ] **Step 1: Import the draft type and key**

En `app/(app)/compras/nueva/page.tsx`, agregar al bloque de imports:

```ts
import { REPOSICION_DRAFT_KEY, type BorradorReposicion } from '@/lib/data/reposicion'
```

- [ ] **Step 2: Apply the draft after loading proveedores/productos**

Reemplazar el `useEffect` existente:

```ts
  useEffect(() => {
    listarProveedores().then(setProveedores)
    listarProductos().then(setProductos)
  }, [])
```

por:

```ts
  useEffect(() => {
    Promise.all([listarProveedores(), listarProductos()]).then(([proveedoresData, productosData]) => {
      setProveedores(proveedoresData)
      setProductos(productosData)
      aplicarBorradorReposicion(productosData)
    })
  }, [])

  function aplicarBorradorReposicion(productosData: Producto[]) {
    const crudo = sessionStorage.getItem(REPOSICION_DRAFT_KEY)
    if (!crudo) return
    sessionStorage.removeItem(REPOSICION_DRAFT_KEY)
    try {
      const borrador: BorradorReposicion = JSON.parse(crudo)
      setProveedorId(borrador.proveedorId)
      setItems(
        borrador.items.map((item) => {
          const producto = productosData.find((p) => p.id === item.productoId)
          return {
            producto_id: item.productoId,
            productoTexto: producto?.nombre ?? '',
            cantidad: String(item.cantidad),
            costo_unitario: String(item.costoUnitario),
            alicuota_iva: String(item.alicuotaIva),
          }
        })
      )
    } catch {
      // Borrador corrupto o de una versión anterior del código — se ignora.
    }
  }
```

`aplicarBorradorReposicion` se define dentro del componente `NuevaFacturaPage` (usa `setProveedorId`/`setItems`, ya definidos ahí), justo después de las declaraciones de estado y antes o después del `useEffect` — cualquiera de las dos ubicaciones es válida en JavaScript/TypeScript porque las declaraciones de función dentro de un componente se resuelven antes de ejecutarse.

- [ ] **Step 3: Run the type checker**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 4: Manual end-to-end check in the browser**

Con el dev server corriendo:
1. Entrar a `/reposicion`, tocar "Crear compra con {proveedor}" en algún paquete.
2. Confirmar que redirige a `/compras/nueva` con el proveedor ya seleccionado en el `<select>` y los ítems (producto, cantidad, costo unitario, alícuota) ya cargados en la tabla.
3. Confirmar que número de comprobante, tipo de comprobante y fecha quedan vacíos/en su valor por defecto (no se prefillean).
4. Volver a entrar a `/compras/nueva` directamente (sin pasar por `/reposicion`) y confirmar que arranca con el formulario vacío de siempre (el borrador ya se borró de `sessionStorage` en el paso 2).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/compras/nueva/page.tsx"
git commit -m "feat: precargar compra nueva desde el borrador de reposición sugerida"
```

---

## Self-Review Notes

- **Cobertura del spec:** función de agrupación pura + wrapper async (Task 1) ✓, ítem de sidebar (Task 2) ✓, página `/reposicion` con paquetes por proveedor, cantidad editable y lista "sin precio" (Task 3) ✓, traspaso vía `sessionStorage` a `/compras/nueva` sin prefill de comprobante/tipo/fecha (Task 4) ✓. Sin tabla nueva, sin sistema de reserva, sin selección automática de proveedor para productos sin precio — todo respetado.
- **Placeholders:** ninguno — cada step tiene código completo.
- **Consistencia de tipos:** `REPOSICION_DRAFT_KEY` y `BorradorReposicion` se definen una sola vez en Task 1 y se importan sin cambios en Tasks 3 y 4; la forma que Task 3 escribe en `sessionStorage` (`proveedorId`, `items: { productoId, cantidad, costoUnitario, alicuotaIva }[]`) coincide exactamente con la que Task 4 lee.
