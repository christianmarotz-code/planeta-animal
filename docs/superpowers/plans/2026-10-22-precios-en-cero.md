# Precios en cero — Plan de implementación

> **Para quien ejecute:** usar superpowers:executing-plans (o subagent-driven-development) para seguir este plan tarea por tarea. Los pasos usan casillas `- [ ]`.

**Objetivo:** que un precio en cero deje de contar como precio real (comparador y Reposición), que la planilla de cada proveedor muestre qué productos están sin precio, y que la importación deje de generar ceros.

**Causa raíz:** `importar/page.tsx` convertía el precio con `Number(...) || 0`. Un valor como `$ 1.200,50` da `NaN` y el `|| 0` lo volvía cero sin avisar (35 de los 38 precios cargados de Bruncas valen 0).

**Arquitectura:** un solo filtro en el armado de las filas del comparador (`armarFilasComparador`, función pura extraída de `listarComparador`) corrige las dos pestañas, las planillas y Reposición. La importación usa `parsearPrecio` y descarta lo inválido contándolo. Una lectura nueva (`listarSinPrecio`) alimenta un aviso en la planilla.

**Tecnología:** Next.js 16, React, TypeScript, Supabase, Vitest.

**Spec:** diseño aprobado en el chat (corrección acotada: sin migración ni cambios de permisos). Contexto: `docs/superpowers/specs/2026-10-22-comparador-por-proveedor-design.md`.

## Restricciones globales

- Los 35 ceros que hay hoy en la base **no se borran**: quedan como pendientes de completar.
- `listarComparador()` sigue devolviendo la misma forma (`FilaComparador`, con `mejor`): Reposición depende de eso.
- No hay migración ni cambios de permisos.
- Antes de afirmar que algo funciona: `npm run typecheck`, `npm run lint` y `npm test`.
- Commits en español, terminados con `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Solo se hace commit y push cuando la persona dueña lo pide.
- GateGuard exige, la primera vez que se edita o crea cada archivo, enumerar quién lo importa, qué API cambia y citar el pedido del usuario. Un primer intento mínimo desbloquea el archivo.

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `lib/data/preciosProveedor.ts` | modificar | `armarFilasComparador` (ignora ceros), `listarSinPrecio`, importación que descarta inválidos |
| `lib/data/preciosProveedor.test.ts` | crear | Pruebas de `armarFilasComparador` |
| `lib/comparador/parsearPrecio.test.ts` | modificar | Casos que causaron los ceros |
| `app/(app)/comparador/importar/page.tsx` | modificar | Usar `parsearPrecio` y mostrar las filas descartadas |
| `app/(app)/comparador/SinPrecio.tsx` | crear | Aviso con la lista de productos sin precio |
| `app/(app)/comparador/proveedor/[id]/page.tsx` | modificar | Cargar y mostrar los productos sin precio |

---

### Tarea 1: Los ceros no cuentan como precio

**Archivos:**
- Modificar: `lib/data/preciosProveedor.ts` (función `listarComparador`)
- Crear: `lib/data/preciosProveedor.test.ts`

**Interfaces:**
- Produce: `armarFilasComparador(productos: Producto[], proveedores: Proveedor[], precios: PrecioProveedor[]): FilaComparador[]`

- [ ] **Paso 1: escribir la prueba que falla**

```ts
// lib/data/preciosProveedor.test.ts
import { describe, expect, it } from 'vitest'
import type { PrecioProveedor, Producto, Proveedor } from '@/types/database'
import { armarFilasComparador } from './preciosProveedor'

const proveedor = (id: string, nombre: string) => ({ id, nombre, activo: true }) as Proveedor
const producto = (id: string, nombre: string) => ({ id, nombre }) as Producto
const precio = (id: string, proveedorId: string, productoId: string, valor: number) =>
  ({ id, proveedor_id: proveedorId, producto_id: productoId, precio: valor, nota: null, actualizado_en: '2026-10-20T00:00:00Z' }) as PrecioProveedor

const bruncas = proveedor('b', 'Bruncas SRL')
const arcuri = proveedor('a', 'Arcuri S.A.')

describe('armarFilasComparador', () => {
  it('un precio en cero no cuenta: ni aparece ni gana como el más barato', () => {
    const filas = armarFilasComparador(
      [producto('1', 'Abbocath N°14')],
      [bruncas, arcuri],
      [precio('p1', 'b', '1', 0), precio('p2', 'a', '1', 1250)]
    )
    expect(filas).toHaveLength(1)
    expect(filas[0].precios.map((p) => p.proveedor.id)).toEqual(['a'])
    expect(filas[0].mejor).toEqual({ proveedor: arcuri, precio: 1250 })
  })

  it('un producto con todos sus precios en cero no aparece', () => {
    const filas = armarFilasComparador([producto('1', 'X')], [bruncas], [precio('p1', 'b', '1', 0)])
    expect(filas).toEqual([])
  })

  it('con precios válidos arma la fila con sus datos, ordenada por nombre', () => {
    const filas = armarFilasComparador(
      [producto('2', 'Zeta'), producto('1', 'Abbocath')],
      [bruncas, arcuri],
      [precio('p1', 'b', '1', 1350), precio('p2', 'a', '1', 1250), precio('p3', 'b', '2', 10)]
    )
    expect(filas.map((f) => f.producto.nombre)).toEqual(['Abbocath', 'Zeta'])
    expect(filas[0].mejor).toEqual({ proveedor: arcuri, precio: 1250 })
    expect(filas[0].precios).toHaveLength(2)
  })

  it('ignora precios de proveedores que no existen', () => {
    const filas = armarFilasComparador([producto('1', 'X')], [bruncas], [precio('p1', 'zzz', '1', 100)])
    expect(filas).toEqual([])
  })
})
```

- [ ] **Paso 2: correrla y ver que falla**

Ejecutar: `npx vitest run lib/data/preciosProveedor.test.ts`
Esperado: FALLA con que `armarFilasComparador` no está exportada.

- [ ] **Paso 3: extraer y corregir la función**

En `lib/data/preciosProveedor.ts`, reemplazar la función `listarComparador` completa por estas dos:

```ts
export function armarFilasComparador(
  productos: Producto[],
  proveedores: Proveedor[],
  precios: PrecioProveedor[]
): FilaComparador[] {
  const proveedoresPorId = new Map(proveedores.map((p) => [p.id, p]))

  const preciosPorProducto = new Map<string, PrecioProveedor[]>()
  for (const precio of precios) {
    // Un precio en cero es un dato faltante, no "gratis": no entra en ninguna comparación.
    if (!(precio.precio > 0)) continue
    const lista = preciosPorProducto.get(precio.producto_id) ?? []
    lista.push(precio)
    preciosPorProducto.set(precio.producto_id, lista)
  }

  const filas: FilaComparador[] = []
  for (const producto of productos) {
    const preciosProducto = preciosPorProducto.get(producto.id)
    if (!preciosProducto || preciosProducto.length === 0) continue
    const preciosFila = preciosProducto
      .map((pp): PrecioDeFila | null => {
        const proveedor = proveedoresPorId.get(pp.proveedor_id)
        if (!proveedor) return null
        return { proveedor, precio: pp.precio, actualizadoEn: pp.actualizado_en, precioId: pp.id, nota: pp.nota ?? null }
      })
      .filter((x): x is PrecioDeFila => x !== null)
    if (preciosFila.length === 0) continue
    const mejor = preciosFila.reduce((min, p) => (p.precio < min.precio ? p : min), preciosFila[0])
    filas.push({ producto, precios: preciosFila, mejor: { proveedor: mejor.proveedor, precio: mejor.precio } })
  }

  return filas.sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre))
}

export async function listarComparador(): Promise<FilaComparador[]> {
  const supabase = createClient()
  const [productos, proveedoresRes] = await Promise.all([listarTodosLosProductos(), supabase.from('proveedores').select('*')])
  if (proveedoresRes.error) throw proveedoresRes.error
  const proveedores = proveedoresRes.data as Proveedor[]

  const precios: PrecioProveedor[] = []
  let desde = 0
  while (true) {
    const { data, error } = await supabase.from('precios_proveedor').select('*').range(desde, desde + TAMANO_PAGINA - 1)
    if (error) throw error
    const pagina = data as PrecioProveedor[]
    precios.push(...pagina)
    if (pagina.length < TAMANO_PAGINA) break
    desde += TAMANO_PAGINA
  }

  return armarFilasComparador(productos, proveedores, precios)
}
```

- [ ] **Paso 4: correr las pruebas**

Ejecutar: `npx vitest run lib/data/preciosProveedor.test.ts && npm test`
Esperado: las 4 pruebas nuevas PASAN y toda la suite sigue pasando (incluida Reposición).

- [ ] **Paso 5: verificar y commit**

Ejecutar: `npm run typecheck && npm run lint`

```bash
git add lib/data/preciosProveedor.ts lib/data/preciosProveedor.test.ts
git commit -m "fix: un precio en cero no cuenta en el comparador ni en Reposición"
```

---

### Tarea 2: La importación no genera ceros

**Archivos:**
- Modificar: `lib/comparador/parsearPrecio.test.ts`
- Modificar: `lib/data/preciosProveedor.ts` (`ResultadoImportacion`, `importarListaPrecios`)
- Modificar: `app/(app)/comparador/importar/page.tsx` (líneas 124-128 y el bloque `resultado`)

- [ ] **Paso 1: pruebas de regresión del caso que causó los ceros**

Agregar dentro del `describe('parsearPrecio', ...)` de `lib/comparador/parsearPrecio.test.ts`:

```ts
  it('el signo de pesos y el formato argentino no dan cero (causa de los ceros de Bruncas)', () => {
    expect(parsearPrecio('$ 1.200,50')).toBe(1200.5)
    expect(parsearPrecio('$1.200,50')).toBe(1200.5)
  })

  it('un texto que no es un precio da null y no 0', () => {
    expect(parsearPrecio('USD 10')).toBeNull()
    expect(parsearPrecio('consultar')).toBeNull()
  })
```

Ejecutar: `npx vitest run lib/comparador/parsearPrecio.test.ts`
Esperado: PASAN (la función ya cubre estos casos; son pruebas de regresión).

- [ ] **Paso 2: la importación descarta y cuenta lo inválido**

En `lib/data/preciosProveedor.ts`:

1. En `ResultadoImportacion`, agregar `sinPrecioValido: number`.
2. En `importarListaPrecios`, junto a `let emparejadosPorNombre = 0`, agregar `let sinPrecioValido = 0`.
3. Dentro del `for (const fila of filas)`, justo después de `if (!fila.nombre && !fila.codigo) continue`, agregar:

```ts
    if (!(fila.precio > 0)) {
      sinPrecioValido++
      continue
    }
```
4. En el `return` final, agregar `sinPrecioValido,`.

- [ ] **Paso 3: usar `parsearPrecio` en la pantalla de importar**

En `app/(app)/comparador/importar/page.tsx`:

1. Agregar la importación `import { parsearPrecio } from '@/lib/comparador/parsearPrecio'`.
2. Reemplazar la línea `precio: Number(String(fila[columnas.precio!] ?? '0').replace(/\./g, '').replace(',', '.')) || 0,` por:

```tsx
        precio: parsearPrecio(String(fila[columnas.precio!] ?? '')) ?? 0,
```
3. En el bloque `{resultado && (...)}`, debajo del texto "Importadas … de …", agregar:

```tsx
            {resultado.sinPrecioValido > 0 && (
              <p className="text-sm text-negative">
                {resultado.sinPrecioValido} {resultado.sinPrecioValido === 1 ? 'fila' : 'filas'} sin precio válido: no se importaron.
              </p>
            )}
```

- [ ] **Paso 4: verificar y commit**

Ejecutar: `npm run typecheck && npm run lint && npm test`

```bash
git add lib/comparador/parsearPrecio.test.ts lib/data/preciosProveedor.ts "app/(app)/comparador/importar/page.tsx"
git commit -m "fix: la importación de listas descarta las filas sin precio válido en vez de guardar cero"
```

---

### Tarea 3: Aviso de productos sin precio en la planilla

**Archivos:**
- Modificar: `lib/data/preciosProveedor.ts` (agregar `listarSinPrecio`)
- Crear: `app/(app)/comparador/SinPrecio.tsx`
- Modificar: `app/(app)/comparador/proveedor/[id]/page.tsx`

**Interfaces:**
- Produce: `listarSinPrecio(proveedorId: string): Promise<{ precioId: string; nombre: string }[]>`, `<SinPrecio items />`

- [ ] **Paso 1: la lectura**

Agregar al final de `lib/data/preciosProveedor.ts`:

```ts
/** Productos que ese proveedor tiene cargados con precio en cero (o vacío), pendientes de completar. */
export async function listarSinPrecio(proveedorId: string): Promise<{ precioId: string; nombre: string }[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('precios_proveedor')
    .select('*')
    .eq('proveedor_id', proveedorId)
    .lte('precio', 0)
  if (error) throw error
  const precios = data as PrecioProveedor[]
  if (precios.length === 0) return []

  const nombres = new Map<string, string>()
  const LOTE = 100
  for (let i = 0; i < precios.length; i += LOTE) {
    const ids = precios.slice(i, i + LOTE).map((p) => p.producto_id)
    const { data: productos, error: errorProductos } = await supabase.from('productos').select('*').in('id', ids)
    if (errorProductos) throw errorProductos
    for (const p of productos as Producto[]) nombres.set(p.id, p.nombre)
  }

  return precios
    .map((p) => ({ precioId: p.id, nombre: nombres.get(p.producto_id) ?? 'Producto sin nombre' }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
}
```

- [ ] **Paso 2: el componente**

```tsx
// app/(app)/comparador/SinPrecio.tsx
'use client'

export function SinPrecio({ items }: { items: { precioId: string; nombre: string }[] }) {
  if (items.length === 0) return null
  return (
    <details className="card px-5 py-4">
      <summary className="cursor-pointer text-sm font-semibold text-ink">
        {items.length} {items.length === 1 ? 'producto sin precio' : 'productos sin precio'}
      </summary>
      <p className="mt-2 text-sm text-ink-soft">
        Están en la lista de este proveedor pero sin precio, así que no entran en las comparaciones. Completalos
        con “+ Cargar precio”.
      </p>
      <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm text-ink sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.precioId}>{item.nombre}</li>
        ))}
      </ul>
    </details>
  )
}
```

- [ ] **Paso 3: integrarlo en la pantalla de la planilla**

En `app/(app)/comparador/proveedor/[id]/page.tsx`:

1. Importaciones: agregar `listarSinPrecio` a la importación de `@/lib/data/preciosProveedor` y `import { SinPrecio } from '../../SinPrecio'`.
2. Estado, junto a los demás `useState`:

```tsx
  const [sinPrecio, setSinPrecio] = useState<{ precioId: string; nombre: string }[]>([])
```
3. En `recargar`, agregar `listarSinPrecio(id)` al `Promise.all` y guardar el resultado:

```tsx
  const recargar = useCallback(async () => {
    const [filasCargadas, proveedores, pendientes] = await Promise.all([
      listarComparador(),
      listarProveedores(),
      listarSinPrecio(id),
    ])
    setFilas(filasCargadas)
    setProveedor(proveedores.find((p) => p.id === id) ?? null)
    setSinPrecio(pendientes)
  }, [id])
```
4. En el `useEffect` de carga inicial, hacer lo mismo:

```tsx
  useEffect(() => {
    Promise.all([listarComparador(), listarProveedores(), listarSinPrecio(id)])
      .then(([filasCargadas, proveedores, pendientes]) => {
        setFilas(filasCargadas)
        setProveedor(proveedores.find((p) => p.id === id) ?? null)
        setSinPrecio(pendientes)
      })
      .catch((err) => setError(mensajeDeError(err, 'No se pudo cargar la planilla.')))
      .finally(() => setLoading(false))
  }, [id])
```
5. Debajo del buscador (`<input ... Buscar producto en esta planilla…`) y antes del bloque `{error && ...}`, agregar:

```tsx
      <SinPrecio items={sinPrecio} />
```

- [ ] **Paso 4: verificar y commit**

Ejecutar: `npm run typecheck && npm run lint && npm test && npm run build`
Esperado: sin errores.

```bash
git add lib/data/preciosProveedor.ts "app/(app)/comparador/SinPrecio.tsx" "app/(app)/comparador/proveedor"
git commit -m "feat: la planilla del proveedor avisa qué productos están sin precio"
```

---

### Tarea 4: Verificación real y cierre

- [ ] **Paso 1: push y despliegue**

Con el visto bueno de la persona dueña: `git push origin main`. Esperar a que Vercel marque el commit como exitoso (`gh api repos/christianmarotz-code/planeta-animal/commits/<sha>/status --jq .state`).

- [ ] **Paso 2: prueba manual**

1. `/comparador` → **Por proveedor**: Bruncas muestra solo los productos con precio real (3 o 4), no 38; Arcuri sigue con su precio.
2. Planilla de Bruncas: aparece el aviso "35 productos sin precio" (o los que queden), desplegable, con los nombres.
3. **+ Cargar precio** sobre uno de esos productos (por ejemplo "COLLAR ISABELINO Nº3"): se guarda, pasa de "sin precio" a la planilla y el aviso baja en uno.
4. Producto que tiene precio real en dos proveedores: "El más barato" / "X % más caro" siguen bien.
5. **Reposición** abre sin errores y ya no sugiere proveedores con precio cero.
6. Importar un CSV de prueba con una fila de precio vacío y otra con `$ 1.200,50`: la segunda se importa con 1200,5 y se muestra "1 fila sin precio válido: no se importó" por la primera.

- [ ] **Paso 3: memoria**

Actualizar `hoja-de-ruta-sistema.md`: pieza 2 hecha (comparador por proveedor y por producto con notas) y corrección de precios en cero; la causa fue `Number(...) || 0` en la importación. Quedan Excel directo, sitio web del proveedor, cierre del día, rentabilidad e inventario real.
