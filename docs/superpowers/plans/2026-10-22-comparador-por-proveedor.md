# Comparador por proveedor y por producto — Plan de implementación

> **Para quien ejecute:** usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para seguir este plan tarea por tarea. Los pasos usan casillas `- [ ]`.

**Objetivo:** reemplazar la tabla gigante del comparador por una vista por proveedor (tarjetas y planilla) y una vista por producto (ranking), con carga manual de precios y una nota de promoción por precio.

**Arquitectura:** funciones puras en `lib/comparador/` (interpretar precios, comparar, resumir, ordenar) con pruebas; una columna nueva `nota` en `precios_proveedor`; pantallas cliente que comparten una sola carga de datos (`listarComparador`) y escriben con dos funciones nuevas de la capa de datos.

**Tecnología:** Next.js 16 (App Router, componentes `'use client'`), React, TypeScript, Supabase, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-22-comparador-por-proveedor-design.md`

## Restricciones globales

- Textos de la interfaz en español rioplatense.
- Un precio es "viejo" si tiene más de 30 días (`DIAS_PRECIO_VIEJO = 30`).
- La nota tiene como máximo 200 caracteres y es opcional.
- `listarComparador()` sigue devolviendo `mejor`: la pantalla Reposición (`agruparReposicionSugerida`) depende de eso y no debe romperse.
- La importación de listas (`importarListaPrecios`) no se modifica: su upsert no escribe `nota`, así que no la pisa.
- Los permisos son los de la pieza 1; no hay cambios de políticas.
- El acceso de Claude a Supabase es de **solo lectura**: la migración la pega la persona dueña en el SQL Editor y se verifica con `select`.
- `AGENTS.md`: esta versión de Next.js tiene cambios incompatibles. `useSearchParams` se envuelve en `<Suspense>`, como indica `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`.
- Antes de afirmar que algo funciona: `npm run typecheck`, `npm run lint` y `npm test`.
- Commits en español, terminados con `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Solo se hace commit y push cuando la persona dueña lo pide, y **el push va después de aplicar y verificar la migración 0036**.
- Un hook de seguridad (GateGuard) exige, la primera vez que se edita o crea cada archivo, enumerar quién lo importa, qué API cambia y citar el pedido del usuario. Hay que hacerlo antes de cada primer edit.

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `supabase/migrations/0036_nota_en_precios_proveedor.sql` | crear | Columna `nota` y auditoría de sus cambios |
| `types/database.ts` | modificar | `PrecioProveedor.nota` |
| `lib/registro/describirCambio.ts` y `.test.ts` | modificar | Frases del historial con nota |
| `lib/comparador/parsearPrecio.ts` y `.test.ts` | crear | Convertir el texto de un precio en número |
| `lib/comparador/vistas.ts` y `.test.ts` | crear | Comparación, resumen, planilla, ranking, búsqueda |
| `lib/data/preciosProveedor.ts` | modificar | `PrecioDeFila`, `guardarPrecio`, `actualizarPrecio` |
| `lib/data/reposicion.test.ts` | modificar | Ajustar el armado de `FilaComparador` |
| `app/(app)/comparador/estilos.ts` | crear | Clase de los campos de texto |
| `app/(app)/comparador/page.tsx` | reemplazar | Pestañas y carga de datos |
| `app/(app)/comparador/VistaProveedores.tsx` | crear | Tarjetas de proveedores |
| `app/(app)/comparador/VistaProductos.tsx` | crear | Ranking por producto |
| `app/(app)/comparador/PlanillaProveedor.tsx` | crear | Tabla con edición de fila |
| `app/(app)/comparador/FormularioPrecio.tsx` | crear | Alta manual de un precio |
| `app/(app)/comparador/proveedor/[id]/page.tsx` | crear | Pantalla de la planilla |
| `app/(app)/comparador/importar/page.tsx` | modificar | Proveedor preseleccionado por URL |
| `docs/ARQUITECTURA.md` | modificar | Documentar la pantalla y la nota |

---

### Tarea 1: Migración 0036 (nota y auditoría)

**Archivos:**
- Crear: `supabase/migrations/0036_nota_en_precios_proveedor.sql`

- [ ] **Paso 1: escribir la migración**

```sql
-- Nota de promoción por precio y registro de sus cambios.
-- Spec: docs/superpowers/specs/2026-10-22-comparador-por-proveedor-design.md
begin;

alter table public.precios_proveedor
  add column nota text check (nota is null or char_length(nota) <= 200);

-- La auditoría de precios ahora también registra los cambios de nota.
create or replace function public.auditar_cambio_precio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text;
  v_id uuid;
  v_proveedor uuid;
  v_producto_id uuid;
  v_anterior numeric;
  v_nuevo numeric;
  v_nota_anterior text;
  v_nota_nueva text;
  v_producto text;
begin
  if tg_op = 'DELETE' then
    v_id := old.id; v_proveedor := old.proveedor_id; v_producto_id := old.producto_id;
    v_anterior := old.precio; v_nuevo := null;
    v_nota_anterior := old.nota; v_nota_nueva := null;
  elsif tg_op = 'INSERT' then
    v_id := new.id; v_proveedor := new.proveedor_id; v_producto_id := new.producto_id;
    v_anterior := null; v_nuevo := new.precio;
    v_nota_anterior := null; v_nota_nueva := new.nota;
  else
    if new.precio is not distinct from old.precio and new.nota is not distinct from old.nota then
      return null;
    end if;
    v_id := new.id; v_proveedor := new.proveedor_id; v_producto_id := new.producto_id;
    v_anterior := old.precio; v_nuevo := new.precio;
    v_nota_anterior := old.nota; v_nota_nueva := new.nota;
  end if;

  select nombre into v_nombre from public.perfiles where id = auth.uid();
  select nombre into v_producto from public.productos where id = v_producto_id;

  insert into public.registro_cambios (usuario_id, usuario_nombre, tabla, registro_id, operacion, proveedor_id, detalle)
  values (
    auth.uid(), coalesce(v_nombre, 'Sistema'), 'precios_proveedor', v_id, lower(tg_op), v_proveedor,
    jsonb_build_object('producto_id', v_producto_id, 'producto', v_producto,
                       'precio_anterior', v_anterior, 'precio_nuevo', v_nuevo,
                       'nota_anterior', v_nota_anterior, 'nota_nueva', v_nota_nueva)
  );
  return null;
end
$$;

commit;
```

- [ ] **Paso 2: commit del archivo**

```bash
git add supabase/migrations/0036_nota_en_precios_proveedor.sql
git commit -m "feat: migración 0036 con nota de promoción en los precios de proveedor"
```

- [ ] **Paso 3: la persona dueña la ejecuta en Supabase (SQL Editor → Run)**

Claude no puede aplicarla. Hay que pedirle que pegue el contenido del archivo y avise.

- [ ] **Paso 4: verificar en solo lectura (`execute_sql`)**

```sql
select column_name, data_type, is_nullable from information_schema.columns
where table_schema = 'public' and table_name = 'precios_proveedor' and column_name = 'nota';
```
Esperado: una fila (`nota`, `text`, `YES`).

```sql
select (pg_get_functiondef('public.auditar_cambio_precio()'::regprocedure) ~ 'nota_nueva') as audita_nota,
       has_function_privilege('authenticated', 'public.auditar_cambio_precio()', 'execute') as auth_ejecuta;
```
Esperado: `audita_nota` en `true` y `auth_ejecuta` en `false`.

---

### Tarea 2: Tipo y historial con nota

**Archivos:**
- Modificar: `types/database.ts` (interfaz `PrecioProveedor`)
- Modificar: `lib/registro/describirCambio.ts`
- Modificar: `lib/registro/describirCambio.test.ts`

- [ ] **Paso 1: agregar `nota` al tipo**

En `types/database.ts`, dentro de `PrecioProveedor`, después de `precio: number`:

```ts
  nota: string | null
```

- [ ] **Paso 2: escribir las pruebas que fallan**

Agregar dentro del `describe('describirCambio', ...)` de `lib/registro/describirCambio.test.ts`:

```ts
  it('precio cargado con nota de promoción', () => {
    const r = {
      ...base,
      operacion: 'insert' as const,
      detalle: { producto: 'Abbocath N°14', precio_anterior: null, precio_nuevo: 1200, nota_anterior: null, nota_nueva: 'Llevando 3, 10% de descuento' },
    }
    expect(describirCambio(r)).toBe('Cargó el precio de Abbocath N°14: $1.200 — nota: «Llevando 3, 10% de descuento»')
  })

  it('solo cambió la nota', () => {
    const r = {
      ...base,
      detalle: { producto: 'Abbocath N°14', precio_anterior: 1200, precio_nuevo: 1200, nota_anterior: null, nota_nueva: '3x2 hasta fin de mes' },
    }
    expect(describirCambio(r)).toBe('Cambió la nota de Abbocath N°14: — → «3x2 hasta fin de mes»')
  })

  it('cambió el precio y la nota', () => {
    const r = {
      ...base,
      detalle: { producto: 'Abbocath N°14', precio_anterior: 1200, precio_nuevo: 1100, nota_anterior: 'Promo vieja', nota_nueva: 'Promo nueva' },
    }
    expect(describirCambio(r)).toBe('Cambió el precio de Abbocath N°14: $1.200 → $1.100 y la nota («Promo vieja» → «Promo nueva»)')
  })

  it('cambió solo el precio y la nota quedó igual', () => {
    const r = {
      ...base,
      detalle: { producto: 'Abbocath N°14', precio_anterior: 1200, precio_nuevo: 1350, nota_anterior: 'Igual', nota_nueva: 'Igual' },
    }
    expect(describirCambio(r)).toBe('Cambió el precio de Abbocath N°14: $1.200 → $1.350')
  })
```

- [ ] **Paso 3: correrlas y ver que fallan**

Ejecutar: `npx vitest run lib/registro/describirCambio.test.ts`
Esperado: FALLAN las 3 primeras pruebas nuevas; las anteriores y la cuarta siguen pasando.

- [ ] **Paso 4: implementación**

En `lib/registro/describirCambio.ts`, agregar debajo de `valorLegible`:

```ts
function notaLegible(valor: unknown): string {
  return typeof valor === 'string' && valor ? `«${valor}»` : '—'
}
```

y reemplazar el bloque `if (r.tabla === 'precios_proveedor') { ... }` por:

```ts
  if (r.tabla === 'precios_proveedor') {
    const producto = typeof d.producto === 'string' && d.producto ? d.producto : 'un producto'
    const notaNueva = typeof d.nota_nueva === 'string' && d.nota_nueva ? ` — nota: «${d.nota_nueva}»` : ''
    if (r.operacion === 'insert') return `Cargó el precio de ${producto}: ${dinero(d.precio_nuevo)}${notaNueva}`
    if (r.operacion === 'delete') return `Borró el precio de ${producto} (${dinero(d.precio_anterior)})`
    const cambioPrecio = d.precio_anterior !== d.precio_nuevo
    const cambioNota = d.nota_anterior !== d.nota_nueva
    const textoPrecio = `${dinero(d.precio_anterior)} → ${dinero(d.precio_nuevo)}`
    const textoNota = `${notaLegible(d.nota_anterior)} → ${notaLegible(d.nota_nueva)}`
    if (cambioPrecio && cambioNota) return `Cambió el precio de ${producto}: ${textoPrecio} y la nota (${textoNota})`
    if (cambioNota) return `Cambió la nota de ${producto}: ${textoNota}`
    return `Cambió el precio de ${producto}: ${textoPrecio}`
  }
```

- [ ] **Paso 5: correrlas y ver que pasan**

Ejecutar: `npx vitest run lib/registro/describirCambio.test.ts`
Esperado: 9 pruebas PASAN.

- [ ] **Paso 6: commit**

```bash
git add types/database.ts lib/registro
git commit -m "feat: el historial de proveedores describe los cambios de nota de promoción"
```

(Nota: `npm run typecheck` fallará hasta la Tarea 4, porque `PrecioProveedor` ya exige `nota`; si falla solo por eso, seguir.)

---

### Tarea 3: Interpretar el precio escrito

**Archivos:**
- Crear: `lib/comparador/parsearPrecio.ts`
- Crear: `lib/comparador/parsearPrecio.test.ts`

**Interfaces:**
- Produce: `parsearPrecio(texto: string): number | null`

- [ ] **Paso 1: escribir la prueba que falla**

```ts
// lib/comparador/parsearPrecio.test.ts
import { describe, expect, it } from 'vitest'
import { parsearPrecio } from './parsearPrecio'

describe('parsearPrecio', () => {
  it('acepta enteros y decimales con punto o coma', () => {
    expect(parsearPrecio('1200')).toBe(1200)
    expect(parsearPrecio('12.5')).toBe(12.5)
    expect(parsearPrecio('1,5')).toBe(1.5)
  })

  it('entiende el formato argentino con separador de miles', () => {
    expect(parsearPrecio('1.200')).toBe(1200)
    expect(parsearPrecio('1.200,50')).toBe(1200.5)
    expect(parsearPrecio('$ 1.350')).toBe(1350)
  })

  it('redondea a dos decimales', () => {
    expect(parsearPrecio('10,555')).toBe(10.56)
  })

  it('rechaza lo que no es un precio positivo', () => {
    expect(parsearPrecio('')).toBeNull()
    expect(parsearPrecio('   ')).toBeNull()
    expect(parsearPrecio('abc')).toBeNull()
    expect(parsearPrecio('0')).toBeNull()
    expect(parsearPrecio('-5')).toBeNull()
    expect(parsearPrecio('1.2.3')).toBeNull()
  })
})
```

- [ ] **Paso 2: correrla y ver que falla**

Ejecutar: `npx vitest run lib/comparador/parsearPrecio.test.ts`
Esperado: FALLA con "Failed to resolve import './parsearPrecio'".

- [ ] **Paso 3: implementación**

```ts
// lib/comparador/parsearPrecio.ts

/** Convierte el texto de un precio ("1.200,50", "1200", "$ 1.350") en número; null si no es válido. */
export function parsearPrecio(texto: string): number | null {
  const limpio = texto.replace(/\$/g, '').replace(/\s/g, '')
  if (limpio === '') return null

  let normal: string
  if (limpio.includes(',')) {
    normal = limpio.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpio)) {
    normal = limpio.replace(/\./g, '')
  } else {
    normal = limpio
  }

  if (!/^\d+(\.\d+)?$/.test(normal)) return null
  const numero = Number(normal)
  return numero > 0 ? Math.round(numero * 100) / 100 : null
}
```

- [ ] **Paso 4: correrla y ver que pasa**

Ejecutar: `npx vitest run lib/comparador/parsearPrecio.test.ts`
Esperado: 4 pruebas PASAN.

- [ ] **Paso 5: commit**

```bash
git add lib/comparador/parsearPrecio.ts lib/comparador/parsearPrecio.test.ts
git commit -m "feat: interpretación de precios escritos en formato argentino"
```

---

### Tarea 4: Capa de datos del comparador

**Archivos:**
- Modificar: `lib/data/preciosProveedor.ts:166-214`
- Modificar: `lib/data/reposicion.test.ts:58-63`

**Interfaces:**
- Produce: `PrecioDeFila`, `FilaComparador` (con `precioId` y `nota`), `guardarPrecio(input)`, `actualizarPrecio(id, cambios)`

- [ ] **Paso 1: ampliar `FilaComparador`**

En `lib/data/preciosProveedor.ts`, reemplazar la interfaz `FilaComparador` por:

```ts
export interface PrecioDeFila {
  proveedor: Proveedor
  precio: number
  actualizadoEn: string
  precioId: string
  nota: string | null
}

export interface FilaComparador {
  producto: Producto
  precios: PrecioDeFila[]
  mejor: { proveedor: Proveedor; precio: number } | null
}
```

- [ ] **Paso 2: completar los campos nuevos al armar las filas**

Dentro de `listarComparador`, reemplazar el `.map(...).filter(...)` de `precios`:

```ts
    const precios = preciosProducto
      .map((pp): PrecioDeFila | null => {
        const proveedor = proveedoresPorId.get(pp.proveedor_id)
        if (!proveedor) return null
        return { proveedor, precio: pp.precio, actualizadoEn: pp.actualizado_en, precioId: pp.id, nota: pp.nota ?? null }
      })
      .filter((x): x is PrecioDeFila => x !== null)
```

- [ ] **Paso 3: funciones de escritura**

Agregar al final del archivo:

```ts
export async function guardarPrecio(input: {
  proveedorId: string
  productoId: string
  precio: number
  nota: string | null
}): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('precios_proveedor').upsert(
    {
      proveedor_id: input.proveedorId,
      producto_id: input.productoId,
      precio: input.precio,
      nota: input.nota,
      actualizado_en: new Date().toISOString(),
    } as never,
    { onConflict: 'proveedor_id,producto_id' }
  )
  if (error) throw error
}

export async function actualizarPrecio(id: string, cambios: { precio: number; nota: string | null }): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('precios_proveedor')
    .update({ ...cambios, actualizado_en: new Date().toISOString() } as never)
    .eq('id', id)
  if (error) throw error
}
```

- [ ] **Paso 4: ajustar la prueba de reposición**

En `lib/data/reposicion.test.ts`, dentro de `filaComparador`, reemplazar la línea de `precios` por:

```ts
    precios: mejor
      ? [{ proveedor: mejor.proveedor, precio: mejor.precio, actualizadoEn: '', precioId: 'pp', nota: null }]
      : [],
```

- [ ] **Paso 5: verificar**

Ejecutar: `npm run typecheck && npm test`
Esperado: sin errores de tipos y todas las pruebas PASAN.

- [ ] **Paso 6: commit**

```bash
git add lib/data/preciosProveedor.ts lib/data/reposicion.test.ts
git commit -m "feat: capa de datos del comparador con nota y escritura de precios"
```

---

### Tarea 5: Funciones puras de las vistas

**Archivos:**
- Crear: `lib/comparador/vistas.ts`
- Crear: `lib/comparador/vistas.test.ts`

**Interfaces:**
- Consume: `FilaComparador`, `PrecioDeFila` (Tarea 4)
- Produce: `DIAS_PRECIO_VIEJO`, `esPrecioViejo(actualizadoEn, hoy, dias?)`, `Comparacion`, `compararConOtros(fila, proveedorId)`, `ResumenProveedor`, `resumirProveedores(filas, proveedores)`, `FilaPlanilla`, `planillaDeProveedor(filas, proveedorId, busqueda?)`, `PosicionRanking`, `rankingDeProducto(fila, permitidos)`, `buscarProductos(filas, busqueda, limite?)`

- [ ] **Paso 1: escribir las pruebas que fallan**

```ts
// lib/comparador/vistas.test.ts
import { describe, expect, it } from 'vitest'
import type { FilaComparador } from '@/lib/data/preciosProveedor'
import type { Producto, Proveedor } from '@/types/database'
import {
  buscarProductos,
  compararConOtros,
  esPrecioViejo,
  planillaDeProveedor,
  rankingDeProducto,
  resumirProveedores,
} from './vistas'

const proveedor = (id: string, nombre: string, activo = true) => ({ id, nombre, activo }) as Proveedor
const producto = (id: string, nombre: string) => ({ id, nombre }) as Producto

function fila(prod: Producto, precios: { p: Proveedor; precio: number; nota?: string | null; fecha?: string }[]): FilaComparador {
  const lista = precios.map((x) => ({
    proveedor: x.p,
    precio: x.precio,
    actualizadoEn: x.fecha ?? '2026-10-20T00:00:00Z',
    precioId: `${prod.id}-${x.p.id}`,
    nota: x.nota ?? null,
  }))
  const mejor = lista.reduce((min, x) => (x.precio < min.precio ? x : min), lista[0])
  return { producto: prod, precios: lista, mejor: { proveedor: mejor.proveedor, precio: mejor.precio } }
}

const bruncas = proveedor('b', 'Bruncas SRL')
const arcuri = proveedor('a', 'Arcuri S.A.')
const beta = proveedor('t', 'BetaPharma S.A.')
const inactivo = proveedor('i', 'Viejo S.A.', false)

describe('esPrecioViejo', () => {
  const hoy = new Date('2026-10-22T12:00:00Z')
  it('es viejo si pasaron más de 30 días', () => {
    expect(esPrecioViejo('2026-09-20T00:00:00Z', hoy)).toBe(true)
  })
  it('no es viejo si pasaron menos de 30 días', () => {
    expect(esPrecioViejo('2026-10-01T00:00:00Z', hoy)).toBe(false)
  })
  it('una fecha inválida no se marca como vieja', () => {
    expect(esPrecioViejo('', hoy)).toBe(false)
  })
})

describe('compararConOtros', () => {
  it('un solo proveedor: único', () => {
    const f = fila(producto('1', 'Abbocath N°14'), [{ p: bruncas, precio: 1200 }])
    expect(compararConOtros(f, 'b')).toEqual({ tipo: 'unico' })
  })

  it('el de menor precio es el más barato', () => {
    const f = fila(producto('1', 'Abbocath N°16'), [{ p: bruncas, precio: 1350 }, { p: arcuri, precio: 1250 }])
    expect(compararConOtros(f, 'a')).toEqual({ tipo: 'mas_barato' })
  })

  it('el más caro dice cuánto más y contra quién', () => {
    const f = fila(producto('1', 'Abbocath N°16'), [{ p: bruncas, precio: 1350 }, { p: arcuri, precio: 1250 }])
    expect(compararConOtros(f, 'b')).toEqual({ tipo: 'mas_caro', porcentaje: 8, contra: 'Arcuri S.A.' })
  })

  it('en empate ambos son los más baratos', () => {
    const f = fila(producto('1', 'X'), [{ p: bruncas, precio: 100 }, { p: arcuri, precio: 100 }])
    expect(compararConOtros(f, 'b')).toEqual({ tipo: 'mas_barato' })
    expect(compararConOtros(f, 'a')).toEqual({ tipo: 'mas_barato' })
  })
})

describe('resumirProveedores', () => {
  const filas = [
    fila(producto('1', 'A'), [{ p: bruncas, precio: 1000, fecha: '2026-10-10T00:00:00Z' }, { p: arcuri, precio: 900, fecha: '2026-10-15T00:00:00Z' }]),
    fila(producto('2', 'B'), [{ p: bruncas, precio: 500, fecha: '2026-10-12T00:00:00Z' }]),
  ]

  it('cuenta precios, última actualización y productos donde es el más barato', () => {
    const r = resumirProveedores(filas, [bruncas, arcuri, beta])
    expect(r.map((x) => x.proveedor.nombre)).toEqual(['Bruncas SRL', 'Arcuri S.A.', 'BetaPharma S.A.'])
    expect(r[0]).toMatchObject({ cantidadPrecios: 2, cantidadMasBarato: 0, ultimaActualizacion: '2026-10-12T00:00:00Z' })
    expect(r[1]).toMatchObject({ cantidadPrecios: 1, cantidadMasBarato: 1 })
    expect(r[2]).toMatchObject({ cantidadPrecios: 0, cantidadMasBarato: 0, ultimaActualizacion: null })
  })

  it('no incluye proveedores inactivos', () => {
    const r = resumirProveedores(filas, [bruncas, inactivo])
    expect(r.map((x) => x.proveedor.id)).toEqual(['b'])
  })
})

describe('planillaDeProveedor', () => {
  const filas = [
    fila(producto('2', 'Zeta'), [{ p: bruncas, precio: 500, nota: '3x2' }]),
    fila(producto('1', 'Abbocath N°14'), [{ p: bruncas, precio: 1200 }, { p: arcuri, precio: 1100 }]),
    fila(producto('3', 'Solo Arcuri'), [{ p: arcuri, precio: 10 }]),
  ]

  it('lista los productos del proveedor ordenados por nombre, con su comparación y nota', () => {
    const r = planillaDeProveedor(filas, 'b')
    expect(r.map((x) => x.producto.nombre)).toEqual(['Abbocath N°14', 'Zeta'])
    expect(r[0].comparacion).toEqual({ tipo: 'mas_caro', porcentaje: 9, contra: 'Arcuri S.A.' })
    expect(r[1]).toMatchObject({ nota: '3x2', precioId: '2-b', comparacion: { tipo: 'unico' } })
  })

  it('filtra por texto sin distinguir mayúsculas', () => {
    expect(planillaDeProveedor(filas, 'b', 'abbo').map((x) => x.producto.id)).toEqual(['1'])
  })
})

describe('rankingDeProducto', () => {
  const f = fila(producto('1', 'Abbocath N°16'), [
    { p: bruncas, precio: 1350 },
    { p: arcuri, precio: 1250, nota: 'Llevando 3, 10%' },
    { p: beta, precio: 1410 },
  ])

  it('ordena del más barato al más caro', () => {
    expect(rankingDeProducto(f, null).map((x) => x.proveedor.nombre)).toEqual(['Arcuri S.A.', 'Bruncas SRL', 'BetaPharma S.A.'])
  })

  it('respeta el filtro de proveedores', () => {
    expect(rankingDeProducto(f, new Set(['b', 't'])).map((x) => x.proveedor.id)).toEqual(['b', 't'])
  })

  it('conserva la nota', () => {
    expect(rankingDeProducto(f, null)[0].nota).toBe('Llevando 3, 10%')
  })
})

describe('buscarProductos', () => {
  const filas = [
    fila(producto('1', 'Abbocath N°14'), [{ p: bruncas, precio: 1 }]),
    fila(producto('2', 'Abbocath N°16'), [{ p: bruncas, precio: 1 }]),
    fila(producto('3', 'Atomizador'), [{ p: bruncas, precio: 1 }]),
  ]

  it('sin texto no devuelve nada', () => {
    expect(buscarProductos(filas, '  ')).toEqual([])
  })

  it('busca por nombre y respeta el límite', () => {
    expect(buscarProductos(filas, 'ABBO').map((f) => f.producto.id)).toEqual(['1', '2'])
    expect(buscarProductos(filas, 'abbo', 1)).toHaveLength(1)
  })
})
```

- [ ] **Paso 2: correrlas y ver que fallan**

Ejecutar: `npx vitest run lib/comparador/vistas.test.ts`
Esperado: FALLA con "Failed to resolve import './vistas'".

- [ ] **Paso 3: implementación**

```ts
// lib/comparador/vistas.ts
import type { FilaComparador } from '@/lib/data/preciosProveedor'
import type { Producto, Proveedor } from '@/types/database'

export const DIAS_PRECIO_VIEJO = 30
const MS_POR_DIA = 86_400_000

export function esPrecioViejo(actualizadoEn: string, hoy: Date, dias = DIAS_PRECIO_VIEJO): boolean {
  const momento = Date.parse(actualizadoEn)
  if (Number.isNaN(momento)) return false
  return (hoy.getTime() - momento) / MS_POR_DIA > dias
}

export type Comparacion =
  | { tipo: 'mas_barato' }
  | { tipo: 'mas_caro'; porcentaje: number; contra: string }
  | { tipo: 'unico' }

export function compararConOtros(fila: FilaComparador, proveedorId: string): Comparacion {
  const propio = fila.precios.find((p) => p.proveedor.id === proveedorId)
  if (!propio || fila.precios.length < 2) return { tipo: 'unico' }
  const masBarato = fila.precios.reduce((min, p) => (p.precio < min.precio ? p : min), fila.precios[0])
  if (propio.precio <= masBarato.precio) return { tipo: 'mas_barato' }
  const porcentaje =
    masBarato.precio > 0 ? Math.round(((propio.precio - masBarato.precio) / masBarato.precio) * 100) : 0
  return { tipo: 'mas_caro', porcentaje, contra: masBarato.proveedor.nombre }
}

export interface ResumenProveedor {
  proveedor: Proveedor
  cantidadPrecios: number
  ultimaActualizacion: string | null
  cantidadMasBarato: number
}

export function resumirProveedores(filas: FilaComparador[], proveedores: Proveedor[]): ResumenProveedor[] {
  const resumenes = new Map<string, ResumenProveedor>()
  for (const proveedor of proveedores) {
    if (proveedor.activo) {
      resumenes.set(proveedor.id, { proveedor, cantidadPrecios: 0, ultimaActualizacion: null, cantidadMasBarato: 0 })
    }
  }
  for (const fila of filas) {
    for (const precio of fila.precios) {
      const resumen = resumenes.get(precio.proveedor.id)
      if (!resumen) continue
      resumen.cantidadPrecios += 1
      if (!resumen.ultimaActualizacion || precio.actualizadoEn > resumen.ultimaActualizacion) {
        resumen.ultimaActualizacion = precio.actualizadoEn
      }
      if (compararConOtros(fila, precio.proveedor.id).tipo === 'mas_barato') resumen.cantidadMasBarato += 1
    }
  }
  return [...resumenes.values()].sort(
    (a, b) => b.cantidadPrecios - a.cantidadPrecios || a.proveedor.nombre.localeCompare(b.proveedor.nombre)
  )
}

export interface FilaPlanilla {
  precioId: string
  producto: Producto
  precio: number
  nota: string | null
  actualizadoEn: string
  comparacion: Comparacion
}

export function planillaDeProveedor(filas: FilaComparador[], proveedorId: string, busqueda = ''): FilaPlanilla[] {
  const termino = busqueda.trim().toLowerCase()
  const resultado: FilaPlanilla[] = []
  for (const fila of filas) {
    const propio = fila.precios.find((p) => p.proveedor.id === proveedorId)
    if (!propio) continue
    if (termino && !fila.producto.nombre.toLowerCase().includes(termino)) continue
    resultado.push({
      precioId: propio.precioId,
      producto: fila.producto,
      precio: propio.precio,
      nota: propio.nota,
      actualizadoEn: propio.actualizadoEn,
      comparacion: compararConOtros(fila, proveedorId),
    })
  }
  return resultado.sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre))
}

export interface PosicionRanking {
  precioId: string
  proveedor: Proveedor
  precio: number
  nota: string | null
  actualizadoEn: string
}

export function rankingDeProducto(fila: FilaComparador, proveedoresPermitidos: Set<string> | null): PosicionRanking[] {
  return fila.precios
    .filter((p) => !proveedoresPermitidos || proveedoresPermitidos.has(p.proveedor.id))
    .map((p) => ({
      precioId: p.precioId,
      proveedor: p.proveedor,
      precio: p.precio,
      nota: p.nota,
      actualizadoEn: p.actualizadoEn,
    }))
    .sort((a, b) => a.precio - b.precio || a.proveedor.nombre.localeCompare(b.proveedor.nombre))
}

export function buscarProductos(filas: FilaComparador[], busqueda: string, limite = 20): FilaComparador[] {
  const termino = busqueda.trim().toLowerCase()
  if (!termino) return []
  return filas.filter((f) => f.producto.nombre.toLowerCase().includes(termino)).slice(0, limite)
}
```

- [ ] **Paso 4: correrlas y ver que pasan**

Ejecutar: `npx vitest run lib/comparador/vistas.test.ts`
Esperado: todas las pruebas PASAN.

- [ ] **Paso 5: verificar y commit**

Ejecutar: `npm run typecheck && npm test`
Esperado: sin errores nuevos (si typecheck marca `app/(app)/comparador/page.tsx`, se resuelve en la Tarea 6).

```bash
git add lib/comparador/vistas.ts lib/comparador/vistas.test.ts
git commit -m "feat: funciones puras del comparador por proveedor y por producto"
```

---

### Tarea 6: Pantalla principal con pestañas

**Archivos:**
- Crear: `app/(app)/comparador/estilos.ts`
- Reemplazar: `app/(app)/comparador/page.tsx`
- Crear: `app/(app)/comparador/VistaProveedores.tsx`
- Crear: `app/(app)/comparador/VistaProductos.tsx`

**Interfaces:**
- Consume: `resumirProveedores`, `buscarProductos`, `rankingDeProducto`, `esPrecioViejo` (Tarea 5), `listarComparador` (Tarea 4)

- [ ] **Paso 1: estilos compartidos**

```ts
// app/(app)/comparador/estilos.ts
export const INPUT_CLASS =
  'rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent'
```

- [ ] **Paso 2: tarjetas de proveedores**

```tsx
// app/(app)/comparador/VistaProveedores.tsx
'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { FilaComparador } from '@/lib/data/preciosProveedor'
import type { Proveedor } from '@/types/database'
import { resumirProveedores } from '@/lib/comparador/vistas'
import { formatearFechaCorta } from '@/lib/facturas/meses'
import { INPUT_CLASS } from './estilos'

export function VistaProveedores({ filas, proveedores }: { filas: FilaComparador[]; proveedores: Proveedor[] }) {
  const [busqueda, setBusqueda] = useState('')

  const resumenes = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    return resumirProveedores(filas, proveedores).filter(
      (r) => !termino || r.proveedor.nombre.toLowerCase().includes(termino)
    )
  }, [filas, proveedores, busqueda])

  return (
    <div className="flex flex-col gap-4">
      <input
        type="text"
        placeholder="Buscar proveedor…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className={`${INPUT_CLASS} w-full max-w-xs`}
      />
      {resumenes.length === 0 ? (
        <p className="card px-5 py-6 text-sm text-ink-faint">No hay proveedores que coincidan.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resumenes.map((r) => (
            <Link
              key={r.proveedor.id}
              href={`/comparador/proveedor/${r.proveedor.id}`}
              className="card flex flex-col gap-2 p-5 transition hover:-translate-y-0.5 hover:border-accent"
            >
              <span className="text-[17px] font-semibold text-ink">{r.proveedor.nombre}</span>
              {r.cantidadPrecios === 0 ? (
                <>
                  <span className="text-sm text-ink-soft">Sin precios todavía</span>
                  <span className="text-sm font-semibold text-accent">Cargar precios →</span>
                </>
              ) : (
                <>
                  <span className="text-sm text-ink-soft">
                    {r.cantidadPrecios} {r.cantidadPrecios === 1 ? 'producto con precio' : 'productos con precio'}
                  </span>
                  {r.ultimaActualizacion && (
                    <span className="text-sm text-ink-faint">
                      Actualizado {formatearFechaCorta(r.ultimaActualizacion.slice(0, 10))}
                    </span>
                  )}
                  {r.cantidadMasBarato > 0 && (
                    <span className="chip up w-fit">Más barato en {r.cantidadMasBarato}</span>
                  )}
                </>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Paso 3: ranking por producto**

```tsx
// app/(app)/comparador/VistaProductos.tsx
'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { FilaComparador } from '@/lib/data/preciosProveedor'
import type { Proveedor } from '@/types/database'
import { buscarProductos, esPrecioViejo, rankingDeProducto } from '@/lib/comparador/vistas'
import { formatearFechaCorta } from '@/lib/facturas/meses'
import { INPUT_CLASS } from './estilos'

export function VistaProductos({ filas, proveedores }: { filas: FilaComparador[]; proveedores: Proveedor[] }) {
  const [busqueda, setBusqueda] = useState('')
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set())
  const [hoy] = useState(() => new Date())

  const proveedoresConPrecios = useMemo(
    () => proveedores.filter((p) => p.activo && filas.some((f) => f.precios.some((x) => x.proveedor.id === p.id))),
    [proveedores, filas]
  )
  const permitidos = useMemo(
    () => new Set(proveedoresConPrecios.filter((p) => !excluidos.has(p.id)).map((p) => p.id)),
    [proveedoresConPrecios, excluidos]
  )
  const resultados = useMemo(() => buscarProductos(filas, busqueda), [filas, busqueda])

  function alternar(id: string) {
    setExcluidos((previo) => {
      const siguiente = new Set(previo)
      if (siguiente.has(id)) siguiente.delete(id)
      else siguiente.add(id)
      return siguiente
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        type="text"
        placeholder="Buscar producto…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className={`${INPUT_CLASS} w-full max-w-xs`}
      />

      {proveedoresConPrecios.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-faint">Comparar con:</span>
          {proveedoresConPrecios.map((p) => {
            const activo = !excluidos.has(p.id)
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={activo}
                onClick={() => alternar(p.id)}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  activo ? 'border-accent text-ink' : 'border-line text-ink-faint line-through'
                }`}
              >
                {p.nombre}
              </button>
            )
          })}
        </div>
      )}

      {busqueda.trim() === '' ? (
        <p className="card px-5 py-6 text-sm text-ink-faint">
          Escribí el nombre de un producto para ver quién lo vende más barato.
        </p>
      ) : resultados.length === 0 ? (
        <p className="card px-5 py-6 text-sm text-ink-faint">
          Ningún producto con precio cargado coincide con la búsqueda.
        </p>
      ) : (
        resultados.map((fila) => {
          const ranking = rankingDeProducto(fila, permitidos)
          return (
            <div key={fila.producto.id} className="card flex flex-col gap-2 p-5">
              <p className="text-[15px] font-semibold text-ink">{fila.producto.nombre}</p>
              {ranking.length === 0 ? (
                <p className="text-sm text-ink-faint">
                  Ninguno de los proveedores elegidos tiene precio para este producto.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {ranking.map((pos, i) => (
                    <div
                      key={pos.precioId}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-sm)] px-3 py-2 text-sm ${
                        i === 0 ? 'bg-positive-soft text-positive' : 'border border-line text-ink'
                      }`}
                    >
                      <span className="flex flex-col">
                        <Link href={`/comparador/proveedor/${pos.proveedor.id}`} className="font-medium hover:underline">
                          {i + 1}.º {pos.proveedor.nombre}
                        </Link>
                        {pos.nota && <span className="text-xs opacity-80">{pos.nota}</span>}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className={esPrecioViejo(pos.actualizadoEn, hoy) ? 'text-xs text-negative' : 'text-xs text-ink-faint'}>
                          {formatearFechaCorta(pos.actualizadoEn.slice(0, 10))}
                        </span>
                        <span className="mono font-semibold">${pos.precio.toLocaleString('es-AR')}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
```

- [ ] **Paso 4: la página con pestañas (reemplaza el contenido completo)**

```tsx
// app/(app)/comparador/page.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { mensajeDeError } from '@/lib/errores'
import { listarComparador, type FilaComparador } from '@/lib/data/preciosProveedor'
import { listarProveedores } from '@/lib/data/proveedores'
import type { Proveedor } from '@/types/database'
import { SkeletonList } from '@/components/Skeleton'
import { VistaProveedores } from './VistaProveedores'
import { VistaProductos } from './VistaProductos'

type Vista = 'proveedor' | 'producto'

const PESTANA_ACTIVA = 'rounded-full bg-accent px-4 py-2 text-sm font-semibold text-[var(--accent-ink)]'
const PESTANA_INACTIVA = 'rounded-full px-4 py-2 text-sm text-ink-soft transition hover:text-ink'

export default function ComparadorPage() {
  const [vista, setVista] = useState<Vista>('proveedor')
  const [filas, setFilas] = useState<FilaComparador[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listarComparador(), listarProveedores()])
      .then(([filasCargadas, proveedoresCargados]) => {
        setFilas(filasCargadas)
        setProveedores(proveedoresCargados)
      })
      .catch((err) => setError(mensajeDeError(err, 'No se pudo cargar el comparador.')))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="flex items-center justify-between rise">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Gestión</p>
          <h1 className="mt-1 text-[27px] text-ink">Comparador de precios</h1>
        </div>
        <Link href="/comparador/importar" className="pill-btn">
          + Importar lista
        </Link>
      </div>

      <div className="flex gap-2 rise" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={vista === 'proveedor'}
          onClick={() => setVista('proveedor')}
          className={vista === 'proveedor' ? PESTANA_ACTIVA : PESTANA_INACTIVA}
        >
          Por proveedor
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={vista === 'producto'}
          onClick={() => setVista('producto')}
          className={vista === 'producto' ? PESTANA_ACTIVA : PESTANA_INACTIVA}
        >
          Por producto
        </button>
      </div>

      {error && <p className="text-sm text-negative">{error}</p>}

      {loading ? (
        <SkeletonList filas={6} />
      ) : vista === 'proveedor' ? (
        <VistaProveedores filas={filas} proveedores={proveedores} />
      ) : (
        <VistaProductos filas={filas} proveedores={proveedores} />
      )}
    </div>
  )
}
```

- [ ] **Paso 5: verificar**

Ejecutar: `npm run typecheck && npm run lint`
Esperado: sin errores. Si algún token de color (`bg-positive-soft`, `text-positive`) no existe en el tema, ajustarlo a uno que sí exista en `app/globals.css`.

- [ ] **Paso 6: commit**

```bash
git add "app/(app)/comparador"
git commit -m "feat: comparador con pestañas por proveedor y por producto"
```

---

### Tarea 7: Planilla del proveedor y carga manual

**Archivos:**
- Crear: `app/(app)/comparador/PlanillaProveedor.tsx`
- Crear: `app/(app)/comparador/FormularioPrecio.tsx`
- Crear: `app/(app)/comparador/proveedor/[id]/page.tsx`

**Interfaces:**
- Consume: `planillaDeProveedor`, `esPrecioViejo`, `FilaPlanilla`, `Comparacion` (Tarea 5), `parsearPrecio` (Tarea 3), `guardarPrecio`, `actualizarPrecio` (Tarea 4)
- Produce: `<PlanillaProveedor filas onGuardar />`, `<FormularioPrecio proveedorId productos productosConPrecio onGuardado onCancelar />`

- [ ] **Paso 1: la tabla con edición de fila**

```tsx
// app/(app)/comparador/PlanillaProveedor.tsx
'use client'

import { useState } from 'react'
import { mensajeDeError } from '@/lib/errores'
import { esPrecioViejo, type Comparacion, type FilaPlanilla } from '@/lib/comparador/vistas'
import { parsearPrecio } from '@/lib/comparador/parsearPrecio'
import { formatearFechaCorta } from '@/lib/facturas/meses'
import { INPUT_CLASS } from './estilos'

const TH = 'px-4 py-3 text-left text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint'

function textoComparacion(c: Comparacion): { texto: string; clase: string } {
  if (c.tipo === 'mas_barato') return { texto: 'El más barato', clase: 'chip up' }
  if (c.tipo === 'mas_caro') return { texto: `${c.porcentaje} % más caro que ${c.contra}`, clase: 'text-negative' }
  return { texto: 'Solo este proveedor', clase: 'text-ink-faint' }
}

export function PlanillaProveedor({
  filas,
  onGuardar,
}: {
  filas: FilaPlanilla[]
  onGuardar: (precioId: string, cambios: { precio: number; nota: string | null }) => Promise<void>
}) {
  const [hoy] = useState(() => new Date())
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [precioTexto, setPrecioTexto] = useState('')
  const [notaTexto, setNotaTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  function empezarEdicion(fila: FilaPlanilla) {
    setEditandoId(fila.precioId)
    setPrecioTexto(String(fila.precio).replace('.', ','))
    setNotaTexto(fila.nota ?? '')
    setError(null)
  }

  async function guardar(fila: FilaPlanilla) {
    const precio = parsearPrecio(precioTexto)
    if (precio === null) return setError('Ingresá un precio mayor a cero.')
    setGuardando(true)
    setError(null)
    try {
      await onGuardar(fila.precioId, { precio, nota: notaTexto.trim() || null })
      setEditandoId(null)
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar el precio. Intentá de nuevo.'))
    } finally {
      setGuardando(false)
    }
  }

  if (filas.length === 0) {
    return <p className="card px-5 py-6 text-sm text-ink-faint">No hay precios que mostrar.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-line-strong">
              <th className={TH}>Producto</th>
              <th className={TH}>Precio</th>
              <th className={TH}>Nota</th>
              <th className={TH}>Comparado con otros</th>
              <th className={TH}>Actualizado</th>
              <th className={TH}></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => {
              const editando = editandoId === fila.precioId
              const comparacion = textoComparacion(fila.comparacion)
              const viejo = esPrecioViejo(fila.actualizadoEn, hoy)
              return (
                <tr key={fila.precioId} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{fila.producto.nombre}</td>
                  {editando ? (
                    <>
                      <td className="px-4 py-2">
                        <input
                          value={precioTexto}
                          onChange={(e) => setPrecioTexto(e.target.value)}
                          inputMode="decimal"
                          aria-label="Precio"
                          className={`${INPUT_CLASS} w-28`}
                        />
                      </td>
                      <td className="px-4 py-2" colSpan={3}>
                        <input
                          value={notaTexto}
                          onChange={(e) => setNotaTexto(e.target.value)}
                          maxLength={200}
                          placeholder="Nota (por ejemplo: llevando 3, 10% de descuento)"
                          aria-label="Nota"
                          className={`${INPUT_CLASS} w-full`}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <button type="button" disabled={guardando} onClick={() => guardar(fila)} className="pill-btn disabled:opacity-50">
                            Guardar
                          </button>
                          <button type="button" onClick={() => setEditandoId(null)} className="text-sm text-ink-faint hover:text-ink">
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="mono px-4 py-3 font-semibold text-ink">${fila.precio.toLocaleString('es-AR')}</td>
                      <td className="px-4 py-3 text-ink-soft">{fila.nota ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={comparacion.clase}>{comparacion.texto}</span>
                      </td>
                      <td className={`px-4 py-3 ${viejo ? 'text-negative' : 'text-ink-faint'}`}>
                        {formatearFechaCorta(fila.actualizadoEn.slice(0, 10))}
                        {viejo && ' · revisar'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => empezarEdicion(fila)} className="text-sm font-semibold text-accent hover:underline">
                          Editar
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {error && <p className="text-sm text-negative">{error}</p>}
    </div>
  )
}
```

- [ ] **Paso 2: el formulario de alta**

```tsx
// app/(app)/comparador/FormularioPrecio.tsx
'use client'

import { useMemo, useState } from 'react'
import { mensajeDeError } from '@/lib/errores'
import { guardarPrecio } from '@/lib/data/preciosProveedor'
import { parsearPrecio } from '@/lib/comparador/parsearPrecio'
import type { Producto } from '@/types/database'
import { INPUT_CLASS } from './estilos'

export function FormularioPrecio({
  proveedorId,
  productos,
  productosConPrecio,
  onGuardado,
  onCancelar,
}: {
  proveedorId: string
  productos: Producto[]
  productosConPrecio: Set<string>
  onGuardado: () => Promise<void>
  onCancelar: () => void
}) {
  const [busqueda, setBusqueda] = useState('')
  const [producto, setProducto] = useState<Producto | null>(null)
  const [precioTexto, setPrecioTexto] = useState('')
  const [notaTexto, setNotaTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const coincidencias = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    if (producto || termino.length < 2) return []
    return productos.filter((p) => p.activo && p.nombre.toLowerCase().includes(termino)).slice(0, 8)
  }, [productos, busqueda, producto])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!producto) return setError('Elegí un producto de la lista.')
    const precio = parsearPrecio(precioTexto)
    if (precio === null) return setError('Ingresá un precio mayor a cero.')
    setGuardando(true)
    setError(null)
    try {
      await guardarPrecio({ proveedorId, productoId: producto.id, precio, nota: notaTexto.trim() || null })
      await onGuardado()
      setBusqueda('')
      setProducto(null)
      setPrecioTexto('')
      setNotaTexto('')
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar el precio. Intentá de nuevo.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="card flex flex-col gap-3 p-5">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Cargar un precio</p>

      <div className="flex flex-col gap-1">
        <input
          value={producto ? producto.nombre : busqueda}
          onChange={(e) => {
            setProducto(null)
            setBusqueda(e.target.value)
          }}
          placeholder="Buscar producto (al menos 2 letras)…"
          aria-label="Producto"
          className={`${INPUT_CLASS} w-full`}
        />
        {coincidencias.length > 0 && (
          <ul className="card divide-y divide-line">
            {coincidencias.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setProducto(p)}
                  className="w-full px-4 py-2 text-left text-sm text-ink hover:bg-accent/5"
                >
                  {p.nombre}
                </button>
              </li>
            ))}
          </ul>
        )}
        {producto && productosConPrecio.has(producto.id) && (
          <p className="text-sm text-ink-soft">Este proveedor ya tiene precio para este producto: se va a actualizar.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          value={precioTexto}
          onChange={(e) => setPrecioTexto(e.target.value)}
          inputMode="decimal"
          placeholder="Precio (por ejemplo 1.200,50)"
          aria-label="Precio"
          className={`${INPUT_CLASS} w-52`}
        />
        <input
          value={notaTexto}
          onChange={(e) => setNotaTexto(e.target.value)}
          maxLength={200}
          placeholder="Nota (por ejemplo: llevando 3, 10% de descuento)"
          aria-label="Nota"
          className={`${INPUT_CLASS} min-w-64 flex-1`}
        />
      </div>

      {error && <p className="text-sm text-negative">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={guardando} className="pill-btn disabled:opacity-50">
          {guardando ? 'Guardando…' : 'Guardar precio'}
        </button>
        <button type="button" onClick={onCancelar} className="text-sm text-ink-faint hover:text-ink">
          Cancelar
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Paso 3: la pantalla de la planilla**

```tsx
// app/(app)/comparador/proveedor/[id]/page.tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { mensajeDeError } from '@/lib/errores'
import { actualizarPrecio, listarComparador, type FilaComparador } from '@/lib/data/preciosProveedor'
import { listarProductos } from '@/lib/data/productos'
import { listarProveedores } from '@/lib/data/proveedores'
import { planillaDeProveedor } from '@/lib/comparador/vistas'
import type { Producto, Proveedor } from '@/types/database'
import { SkeletonList } from '@/components/Skeleton'
import { INPUT_CLASS } from '../../estilos'
import { PlanillaProveedor } from '../../PlanillaProveedor'
import { FormularioPrecio } from '../../FormularioPrecio'

export default function PlanillaProveedorPage() {
  const { id } = useParams<{ id: string }>()
  const [filas, setFilas] = useState<FilaComparador[]>([])
  const [proveedor, setProveedor] = useState<Proveedor | null>(null)
  const [productos, setProductos] = useState<Producto[]>([])
  const [mostrandoFormulario, setMostrandoFormulario] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const [filasCargadas, proveedores] = await Promise.all([listarComparador(), listarProveedores()])
    setFilas(filasCargadas)
    setProveedor(proveedores.find((p) => p.id === id) ?? null)
  }, [id])

  useEffect(() => {
    cargar()
      .catch((err) => setError(mensajeDeError(err, 'No se pudo cargar la planilla.')))
      .finally(() => setLoading(false))
  }, [cargar])

  async function abrirFormulario() {
    setMostrandoFormulario(true)
    if (productos.length > 0) return
    try {
      setProductos(await listarProductos())
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cargar la lista de productos.'))
    }
  }

  const planilla = useMemo(() => planillaDeProveedor(filas, id, busqueda), [filas, id, busqueda])
  const productosConPrecio = useMemo(
    () => new Set(planillaDeProveedor(filas, id).map((f) => f.producto.id)),
    [filas, id]
  )

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-5 sm:p-8">
        <SkeletonList filas={6} />
      </div>
    )
  }

  if (!proveedor) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-3 p-5 sm:p-8">
        <p className="text-sm text-negative">{error ?? 'No se encontró el proveedor.'}</p>
        <Link href="/comparador" className="text-sm text-accent hover:underline">
          Volver al comparador
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rise">
        <div>
          <Link href="/comparador" className="text-sm text-ink-faint hover:text-ink">
            ← Comparador
          </Link>
          <h1 className="mt-1 text-[27px] text-ink">{proveedor.nombre}</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/comparador/importar?proveedor=${proveedor.id}`} className="pill-btn">
            Importar lista
          </Link>
          <button type="button" onClick={abrirFormulario} className="pill-btn">
            + Cargar precio
          </button>
        </div>
      </div>

      {mostrandoFormulario && (
        <FormularioPrecio
          proveedorId={proveedor.id}
          productos={productos}
          productosConPrecio={productosConPrecio}
          onGuardado={cargar}
          onCancelar={() => setMostrandoFormulario(false)}
        />
      )}

      <input
        type="text"
        placeholder="Buscar producto en esta planilla…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className={`${INPUT_CLASS} w-full max-w-xs`}
      />

      {error && <p className="text-sm text-negative">{error}</p>}

      <PlanillaProveedor
        filas={planilla}
        onGuardar={async (precioId, cambios) => {
          await actualizarPrecio(precioId, cambios)
          await cargar()
        }}
      />
    </div>
  )
}
```

- [ ] **Paso 4: verificar**

Ejecutar: `npm run typecheck && npm run lint`
Esperado: sin errores.

- [ ] **Paso 5: commit**

```bash
git add "app/(app)/comparador"
git commit -m "feat: planilla de cada proveedor con carga manual y edición de precios y notas"
```

---

### Tarea 8: Importar con el proveedor ya elegido

**Archivos:**
- Modificar: `app/(app)/comparador/importar/page.tsx:4-5,49,51`

- [ ] **Paso 1: leer el proveedor de la URL**

En `app/(app)/comparador/importar/page.tsx`:

1. Cambiar la importación de React y agregar la de navegación:

```tsx
import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
```

2. Renombrar la función del componente y leer el parámetro. Reemplazar:

```tsx
export default function ImportarPreciosPage() {
```
por:

```tsx
function ImportarPrecios() {
  const parametros = useSearchParams()
```

y reemplazar `const [proveedorId, setProveedorId] = useState('')` por:

```tsx
  const [proveedorId, setProveedorId] = useState(parametros.get('proveedor') ?? '')
```

3. Al final del archivo, agregar el componente exportado con `Suspense`:

```tsx
export default function ImportarPreciosPage() {
  return (
    <Suspense fallback={null}>
      <ImportarPrecios />
    </Suspense>
  )
}
```

- [ ] **Paso 2: verificar y construir**

Ejecutar: `npm run typecheck && npm run lint && npm run build`
Esperado: sin errores; el build termina sin el aviso "useSearchParams should be wrapped in a suspense boundary".

- [ ] **Paso 3: commit**

```bash
git add "app/(app)/comparador/importar/page.tsx"
git commit -m "feat: la importación de listas abre con el proveedor ya elegido"
```

---

### Tarea 9: Verificación final, documentación y prueba real

**Archivos:**
- Modificar: `docs/ARQUITECTURA.md`

- [ ] **Paso 1: documentar**

Agregar a `docs/ARQUITECTURA.md` una sección "Comparador de precios" que describa: las dos pestañas, la planilla por proveedor, la nota de promoción (`precios_proveedor.nota`, máximo 200 caracteres), la regla de precio viejo (30 días) y que `listarComparador()` alimenta también a Reposición. Ejecutar:

```bash
npm run typecheck && npm run lint && npm test
git add docs/ARQUITECTURA.md
git commit -m "docs: pantalla del comparador por proveedor y por producto"
```

- [ ] **Paso 2: confirmar que la migración 0036 está aplicada**

Repetir las consultas de verificación del Paso 4 de la Tarea 1. **No hacer push antes de que den lo esperado.**

- [ ] **Paso 3: push y despliegue**

Con el visto bueno de la persona dueña: `git push origin main`. Esperar a que Vercel marque el commit como exitoso (`gh api repos/christianmarotz-code/planeta-animal/commits/<sha>/status --jq .state`).

- [ ] **Paso 4: prueba manual**

Con la cuenta de administrador (y repetir con la de empleado):

1. `/comparador` abre en **Por proveedor** con una tarjeta por proveedor; Bruncas muestra 37 productos; los demás, "Sin precios todavía".
2. Tocar Bruncas: aparece su planilla con producto, precio, nota, comparación y fecha.
3. **+ Cargar precio**: buscar un producto, cargar `1.200,50` y la nota "Llevando 3, 10% de descuento"; aparece en la planilla.
4. **Editar** una fila: cambiar precio y nota, Guardar; se actualiza.
5. Repetir la carga del mismo producto: avisa que se va a actualizar.
6. Cargar el mismo producto en otro proveedor con precio distinto: en ambas planillas aparece "El más barato" y "X % más caro que …".
7. Pestaña **Por producto**: buscar ese producto, ver el ranking con las notas; excluir un proveedor con su botón y comprobar que desaparece.
8. **Importar lista** desde la planilla abre la importación con el proveedor elegido.
9. En el proveedor, **Historial de cambios** muestra "Cargó el precio de … — nota: …" y "Cambió la nota …" con el nombre de quien lo hizo.
10. La pantalla **Reposición** sigue abriendo sin errores.

- [ ] **Paso 5: limpieza y memoria**

Borrar los precios de prueba (con la cuenta de administrador, desde la base o la pantalla que corresponda) y actualizar `hoja-de-ruta-sistema.md`: pieza 2 hecha; quedan Excel directo, sitio web del proveedor, cierre del día, rentabilidad e inventario real.
