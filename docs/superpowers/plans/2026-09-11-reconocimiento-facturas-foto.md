# Reconocimiento de facturas por foto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar que el administrador saque/suba una foto de una factura en papel en `/compras/nueva`, que Claude (visión) lea los datos y pre-llene el formulario existente, y que el admin revise/corrija todo antes de guardar (sin cambios al flujo de guardado actual).

**Architecture:** Nueva API route server-side (`app/api/facturas/reconocer`) que recibe la ruta de una imagen ya subida a un bucket privado de Supabase Storage, la manda a Claude (Anthropic SDK, tool-use forzado a JSON) y devuelve datos saneados. El frontend de `/compras/nueva` sube la foto, llama a esa ruta, y usa funciones puras de matching para pre-seleccionar proveedor/productos existentes en el mismo formulario que ya existe — nada se persiste hasta que el admin aprieta "Guardar factura".

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (Postgres + Storage + Auth), TypeScript, Vitest, `@anthropic-ai/sdk` (nuevo).

**Spec:** `docs/superpowers/specs/2026-09-11-reconocimiento-facturas-foto-design.md`

## Global Constraints

- Solo usuarios con `rol = 'administrador'` en `perfiles` pueden subir la foto, llamar al reconocimiento y ver los adjuntos guardados en el bucket `facturas-adjuntos`.
- El bucket `facturas-adjuntos` es **privado** (`public: false`).
- Ningún dato reconocido se guarda en la base hasta que el admin aprieta "Guardar factura" — la RPC `registrar_factura_compra` (existente) no cambia.
- La API route nunca debe romper con 500 por una falla de reconocimiento (imagen ilegible, timeout de Claude, JSON inválido): responde `200` con `{ ok: false, error }` para que el frontend caiga a formulario vacío/editable.
- Variable de entorno nueva: `ANTHROPIC_API_KEY` (server-only, sin prefijo `NEXT_PUBLIC_`).
- Nueva dependencia: `@anthropic-ai/sdk`.
- Seguir el estilo del repo: nombres de funciones/variables en español (`registrarFacturaCompra`, `listarProveedores`, etc.), sin comentarios explicando el qué, solo el porqué cuando no sea obvio.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0014_facturas_adjuntos_storage.sql` | Bucket privado `facturas-adjuntos` + políticas RLS (solo admins). |
| `lib/text/normalizar.ts` | Normalización de texto (minúsculas, sin acentos) para comparar strings. |
| `lib/data/facturaMatching.ts` | Emparejar proveedor/producto detectado contra los catálogos existentes. |
| `lib/facturas/reconocimientoSchema.ts` | Tipos + función pura que sanea el JSON crudo devuelto por Claude. |
| `lib/image/redimensionarImagen.ts` | Cálculo de dimensiones al redimensionar (puro) + función que redimensiona un `File` en el browser (canvas). |
| `lib/auth/requerirAdministrador.ts` | Helper de auth compartido, extraído de `app/api/usuarios/route.ts`. |
| `app/api/usuarios/route.ts` | *(modificar)* usar el helper extraído en vez de su copia local. |
| `app/api/facturas/reconocer/route.ts` | Route handler: valida admin, arma URL firmada, llama a Claude, devuelve JSON saneado. |
| `lib/data/facturas.ts` | *(modificar)* agregar `subirFotoFactura` y `reconocerFactura`. |
| `app/(app)/compras/nueva/page.tsx` | *(modificar)* UI de carga de foto, preview, pre-llenado del formulario. |
| `.env.local.example` | *(modificar)* agregar `ANTHROPIC_API_KEY=`. |

---

### Task 1: Storage — bucket privado para adjuntos de facturas

**Files:**
- Create: `supabase/migrations/0014_facturas_adjuntos_storage.sql`

**Interfaces:**
- Produces: bucket de Storage `facturas-adjuntos` (privado), accesible en `insert`/`select` solo para usuarios con `perfiles.rol = 'administrador'`.

- [ ] **Step 1: Escribir la migración**

```sql
-- Bucket privado para las fotos de facturas que el admin sube para
-- reconocimiento automático. A diferencia de "avatars" (público, 0006),
-- las facturas pueden contener datos comerciales sensibles, así que el
-- acceso queda restringido a administradores (no "dueño de la carpeta":
-- cualquier admin debe poder ver una factura subida por otro admin).
insert into storage.buckets (id, name, public)
values ('facturas-adjuntos', 'facturas-adjuntos', false);

create policy "admins suben adjuntos de facturas"
  on storage.objects for insert
  with check (
    bucket_id = 'facturas-adjuntos'
    and exists (
      select 1 from perfiles where id = auth.uid() and rol = 'administrador'
    )
  );

create policy "admins ven adjuntos de facturas"
  on storage.objects for select
  using (
    bucket_id = 'facturas-adjuntos'
    and exists (
      select 1 from perfiles where id = auth.uid() and rol = 'administrador'
    )
  );
```

- [ ] **Step 2: Aplicar la migración**

Aplicá la migración al proyecto de Supabase (con la herramienta/CLI que uses habitualmente para las migraciones anteriores de este repo, ej. `mcp__supabase__apply_migration` o `supabase db push`).

- [ ] **Step 3: Verificar**

Confirmá que el bucket existe y es privado:

```sql
select id, public from storage.buckets where id = 'facturas-adjuntos';
```

Expected: una fila, `public = false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0014_facturas_adjuntos_storage.sql
git commit -m "feat: agregar bucket privado facturas-adjuntos para fotos de facturas"
```

---

### Task 2: Normalización de texto

**Files:**
- Create: `lib/text/normalizar.ts`
- Test: `lib/text/normalizar.test.ts`

**Interfaces:**
- Produces: `normalizarTexto(texto: string): string` — minúsculas, sin acentos, sin espacios repetidos ni al borde. Usado por `lib/data/facturaMatching.ts` (Task 3).

- [ ] **Step 1: Escribir el test que falla**

```typescript
// lib/text/normalizar.test.ts
import { describe, it, expect } from 'vitest'
import { normalizarTexto } from './normalizar'

describe('normalizarTexto', () => {
  it('pasa a minúsculas', () => {
    expect(normalizarTexto('Purina PRO PLAN')).toBe('purina pro plan')
  })

  it('quita acentos', () => {
    expect(normalizarTexto('Alimentación Balanceada')).toBe('alimentacion balanceada')
  })

  it('recorta espacios al borde y colapsa espacios repetidos', () => {
    expect(normalizarTexto('  Royal   Canin  ')).toBe('royal canin')
  })

  it('devuelve string vacío para input vacío', () => {
    expect(normalizarTexto('')).toBe('')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- lib/text/normalizar.test.ts`
Expected: FAIL — `Cannot find module './normalizar'`

- [ ] **Step 3: Implementación mínima**

```typescript
// lib/text/normalizar.ts
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- lib/text/normalizar.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/text/normalizar.ts lib/text/normalizar.test.ts
git commit -m "feat: agregar normalizarTexto para comparar strings sin acentos/mayúsculas"
```

---

### Task 3: Matching de proveedor/producto detectado contra el catálogo

**Files:**
- Create: `lib/data/facturaMatching.ts`
- Test: `lib/data/facturaMatching.test.ts`

**Interfaces:**
- Consumes: `normalizarTexto(texto: string): string` (Task 2); tipos `Proveedor`, `Producto` de `@/types/database`.
- Produces:
  - `emparejarProveedor(detectado: { nombre: string | null; cuit: string | null }, proveedores: Proveedor[]): Proveedor | null`
  - `emparejarProducto(nombreDetectado: string | null, productos: Producto[]): Producto | null`
  - Usados por `app/(app)/compras/nueva/page.tsx` (Task 9).

- [ ] **Step 1: Escribir el test que falla**

```typescript
// lib/data/facturaMatching.test.ts
import { describe, it, expect } from 'vitest'
import { emparejarProveedor, emparejarProducto } from './facturaMatching'
import type { Proveedor, Producto } from '@/types/database'

function proveedor(id: string, nombre: string, cuit: string | null = null): Proveedor {
  return {
    id,
    nombre,
    cuit,
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

function producto(id: string, nombre: string): Producto {
  return {
    id,
    nombre,
    categoria: null,
    rama: null,
    unidad_compra: 'unidad',
    unidad_stock: 'unidad',
    factor_conversion: 1,
    stock_actual: 0,
    stock_minimo: 0,
    costo_unitario_actual: 0,
    precio_venta: 0,
    alicuota_iva: 21,
    activo: true,
    codigo: null,
    codigo_barras: null,
    created_at: '',
  }
}

describe('emparejarProveedor', () => {
  const proveedores = [
    proveedor('p1', 'Distribuidora Central S.A.', '30712345678'),
    proveedor('p2', 'Royal Canin Argentina'),
  ]

  it('matchea por CUIT exacto, ignorando guiones', () => {
    const resultado = emparejarProveedor({ nombre: null, cuit: '30-71234567-8' }, proveedores)
    expect(resultado?.id).toBe('p1')
  })

  it('matchea por nombre exacto normalizado', () => {
    const resultado = emparejarProveedor({ nombre: 'royal canin argentina', cuit: null }, proveedores)
    expect(resultado?.id).toBe('p2')
  })

  it('matchea por coincidencia parcial de nombre', () => {
    const resultado = emparejarProveedor({ nombre: 'Distribuidora Central', cuit: null }, proveedores)
    expect(resultado?.id).toBe('p1')
  })

  it('devuelve null si no hay ningún match', () => {
    const resultado = emparejarProveedor({ nombre: 'Proveedor Inexistente', cuit: '99999999999' }, proveedores)
    expect(resultado).toBeNull()
  })

  it('devuelve null si no viene nombre ni cuit', () => {
    const resultado = emparejarProveedor({ nombre: null, cuit: null }, proveedores)
    expect(resultado).toBeNull()
  })
})

describe('emparejarProducto', () => {
  const productos = [producto('prod1', 'Pipeta Antipulgas Grande'), producto('prod2', 'Balanceado Gato Adulto 3kg')]

  it('matchea por nombre exacto normalizado', () => {
    expect(emparejarProducto('pipeta antipulgas grande', productos)?.id).toBe('prod1')
  })

  it('matchea por coincidencia parcial', () => {
    expect(emparejarProducto('Balanceado Gato Adulto', productos)?.id).toBe('prod2')
  })

  it('devuelve null si no matchea nada', () => {
    expect(emparejarProducto('Shampoo Antipulgas', productos)).toBeNull()
  })

  it('devuelve null para input null o vacío', () => {
    expect(emparejarProducto(null, productos)).toBeNull()
    expect(emparejarProducto('', productos)).toBeNull()
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- lib/data/facturaMatching.test.ts`
Expected: FAIL — `Cannot find module './facturaMatching'`

- [ ] **Step 3: Implementación mínima**

```typescript
// lib/data/facturaMatching.ts
import type { Proveedor, Producto } from '@/types/database'
import { normalizarTexto } from '@/lib/text/normalizar'

export function emparejarProveedor(
  detectado: { nombre: string | null; cuit: string | null },
  proveedores: Proveedor[]
): Proveedor | null {
  if (detectado.cuit) {
    const cuitNormalizado = detectado.cuit.replace(/\D/g, '')
    const porCuit = proveedores.find((p) => p.cuit && p.cuit.replace(/\D/g, '') === cuitNormalizado)
    if (porCuit) return porCuit
  }

  if (detectado.nombre) {
    const nombreNormalizado = normalizarTexto(detectado.nombre)
    const porNombreExacto = proveedores.find((p) => normalizarTexto(p.nombre) === nombreNormalizado)
    if (porNombreExacto) return porNombreExacto

    const porNombreParcial = proveedores.find((p) => {
      const nombreProveedor = normalizarTexto(p.nombre)
      return nombreProveedor.includes(nombreNormalizado) || nombreNormalizado.includes(nombreProveedor)
    })
    if (porNombreParcial) return porNombreParcial
  }

  return null
}

export function emparejarProducto(nombreDetectado: string | null, productos: Producto[]): Producto | null {
  if (!nombreDetectado) return null
  const nombreNormalizado = normalizarTexto(nombreDetectado)
  if (!nombreNormalizado) return null

  const exacto = productos.find((p) => normalizarTexto(p.nombre) === nombreNormalizado)
  if (exacto) return exacto

  const parcial = productos.find((p) => {
    const nombreProducto = normalizarTexto(p.nombre)
    return nombreProducto.includes(nombreNormalizado) || nombreNormalizado.includes(nombreProducto)
  })
  return parcial ?? null
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- lib/data/facturaMatching.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/data/facturaMatching.ts lib/data/facturaMatching.test.ts
git commit -m "feat: agregar matching de proveedor/producto detectado contra el catálogo"
```

---

### Task 4: Saneamiento del JSON devuelto por Claude

**Files:**
- Create: `lib/facturas/reconocimientoSchema.ts`
- Test: `lib/facturas/reconocimientoSchema.test.ts`

**Interfaces:**
- Produces:
  - `interface ItemFacturaDetectado { descripcion: string; cantidad: number | null; costo_unitario: number | null; alicuota_iva: number | null }`
  - `interface FacturaDetectada { proveedor_nombre: string | null; proveedor_cuit: string | null; tipo_comprobante: TipoComprobante | null; numero_comprobante: string | null; fecha: string | null; items: ItemFacturaDetectado[]; subtotal: number | null; iva_total: number | null; total: number | null }`
  - `sanearFacturaDetectada(raw: unknown): FacturaDetectada`
  - Usados por `app/api/facturas/reconocer/route.ts` (Task 7).

- [ ] **Step 1: Escribir el test que falla**

```typescript
// lib/facturas/reconocimientoSchema.test.ts
import { describe, it, expect } from 'vitest'
import { sanearFacturaDetectada } from './reconocimientoSchema'

describe('sanearFacturaDetectada', () => {
  it('sanea una respuesta completa y válida', () => {
    const resultado = sanearFacturaDetectada({
      proveedor_nombre: 'Distribuidora Central S.A.',
      proveedor_cuit: '30-71234567-8',
      tipo_comprobante: 'Factura A',
      numero_comprobante: '0001-00012345',
      fecha: '2026-09-10',
      items: [
        { descripcion: 'Balanceado Perro Adulto 15kg', cantidad: 10, costo_unitario: 25000, alicuota_iva: 21 },
      ],
      subtotal: 250000,
      iva_total: 52500,
      total: 302500,
    })

    expect(resultado).toEqual({
      proveedor_nombre: 'Distribuidora Central S.A.',
      proveedor_cuit: '30-71234567-8',
      tipo_comprobante: 'Factura A',
      numero_comprobante: '0001-00012345',
      fecha: '2026-09-10',
      items: [
        { descripcion: 'Balanceado Perro Adulto 15kg', cantidad: 10, costo_unitario: 25000, alicuota_iva: 21 },
      ],
      subtotal: 250000,
      iva_total: 52500,
      total: 302500,
    })
  })

  it('descarta un tipo_comprobante que no es uno de los válidos', () => {
    const resultado = sanearFacturaDetectada({ tipo_comprobante: 'Ticket X' })
    expect(resultado.tipo_comprobante).toBeNull()
  })

  it('descarta una fecha con formato inválido', () => {
    const resultado = sanearFacturaDetectada({ fecha: '10/09/2026' })
    expect(resultado.fecha).toBeNull()
  })

  it('descarta campos numéricos no numéricos y deja el resto', () => {
    const resultado = sanearFacturaDetectada({ subtotal: 'no sé', total: 1000 })
    expect(resultado.subtotal).toBeNull()
    expect(resultado.total).toBe(1000)
  })

  it('descarta ítems sin descripción y sanea los campos numéricos ítem por ítem', () => {
    const resultado = sanearFacturaDetectada({
      items: [
        { descripcion: '', cantidad: 1, costo_unitario: 100, alicuota_iva: 21 },
        { descripcion: 'Collar antipulgas', cantidad: 'dos', costo_unitario: 5000, alicuota_iva: 21 },
      ],
    })
    expect(resultado.items).toEqual([
      { descripcion: 'Collar antipulgas', cantidad: null, costo_unitario: 5000, alicuota_iva: 21 },
    ])
  })

  it('devuelve todos los campos en null/[] para un input vacío o inválido', () => {
    expect(sanearFacturaDetectada({})).toEqual({
      proveedor_nombre: null,
      proveedor_cuit: null,
      tipo_comprobante: null,
      numero_comprobante: null,
      fecha: null,
      items: [],
      subtotal: null,
      iva_total: null,
      total: null,
    })
    expect(sanearFacturaDetectada(null)).toEqual({
      proveedor_nombre: null,
      proveedor_cuit: null,
      tipo_comprobante: null,
      numero_comprobante: null,
      fecha: null,
      items: [],
      subtotal: null,
      iva_total: null,
      total: null,
    })
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- lib/facturas/reconocimientoSchema.test.ts`
Expected: FAIL — `Cannot find module './reconocimientoSchema'`

- [ ] **Step 3: Implementación mínima**

```typescript
// lib/facturas/reconocimientoSchema.ts
import type { TipoComprobante } from '@/types/database'

export interface ItemFacturaDetectado {
  descripcion: string
  cantidad: number | null
  costo_unitario: number | null
  alicuota_iva: number | null
}

export interface FacturaDetectada {
  proveedor_nombre: string | null
  proveedor_cuit: string | null
  tipo_comprobante: TipoComprobante | null
  numero_comprobante: string | null
  fecha: string | null
  items: ItemFacturaDetectado[]
  subtotal: number | null
  iva_total: number | null
  total: number | null
}

const TIPOS_COMPROBANTE_VALIDOS: TipoComprobante[] = [
  'Factura A',
  'Factura B',
  'Factura C',
  'Remito',
  'Nota de Credito',
]

const REGEX_FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/

function comoStringONull(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const recortado = valor.trim()
  return recortado.length > 0 ? recortado : null
}

function comoNumeroONull(valor: unknown): number | null {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return null
  return valor
}

function comoTipoComprobanteONull(valor: unknown): TipoComprobante | null {
  return TIPOS_COMPROBANTE_VALIDOS.includes(valor as TipoComprobante) ? (valor as TipoComprobante) : null
}

function comoFechaISOONull(valor: unknown): string | null {
  return typeof valor === 'string' && REGEX_FECHA_ISO.test(valor) ? valor : null
}

function sanearItems(valor: unknown): ItemFacturaDetectado[] {
  if (!Array.isArray(valor)) return []
  const items: ItemFacturaDetectado[] = []
  for (const itemCrudo of valor) {
    if (typeof itemCrudo !== 'object' || itemCrudo === null) continue
    const item = itemCrudo as Record<string, unknown>
    const descripcion = comoStringONull(item.descripcion)
    if (!descripcion) continue
    items.push({
      descripcion,
      cantidad: comoNumeroONull(item.cantidad),
      costo_unitario: comoNumeroONull(item.costo_unitario),
      alicuota_iva: comoNumeroONull(item.alicuota_iva),
    })
  }
  return items
}

export function sanearFacturaDetectada(raw: unknown): FacturaDetectada {
  const datos = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    proveedor_nombre: comoStringONull(datos.proveedor_nombre),
    proveedor_cuit: comoStringONull(datos.proveedor_cuit),
    tipo_comprobante: comoTipoComprobanteONull(datos.tipo_comprobante),
    numero_comprobante: comoStringONull(datos.numero_comprobante),
    fecha: comoFechaISOONull(datos.fecha),
    items: sanearItems(datos.items),
    subtotal: comoNumeroONull(datos.subtotal),
    iva_total: comoNumeroONull(datos.iva_total),
    total: comoNumeroONull(datos.total),
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- lib/facturas/reconocimientoSchema.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/facturas/reconocimientoSchema.ts lib/facturas/reconocimientoSchema.test.ts
git commit -m "feat: agregar saneamiento del JSON de factura detectado por Claude"
```

---

### Task 5: Redimensionado de imagen en el browser

**Files:**
- Create: `lib/image/redimensionarImagen.ts`
- Test: `lib/image/redimensionarImagen.test.ts`

**Interfaces:**
- Produces:
  - `calcularDimensionesRedimensionadas(anchoOriginal: number, altoOriginal: number, anchoMaximo: number): { ancho: number; alto: number }` (pura, testeada)
  - `redimensionarImagen(file: File, anchoMaximo?: number): Promise<File>` (usa `Image`/`canvas` del browser; no se testea unitariamente — se verifica manualmente en Task 10). Consumida por `app/(app)/compras/nueva/page.tsx` (Task 9).

- [ ] **Step 1: Escribir el test que falla (solo para la parte pura)**

```typescript
// lib/image/redimensionarImagen.test.ts
import { describe, it, expect } from 'vitest'
import { calcularDimensionesRedimensionadas } from './redimensionarImagen'

describe('calcularDimensionesRedimensionadas', () => {
  it('no cambia una imagen que ya es más angosta que el máximo', () => {
    expect(calcularDimensionesRedimensionadas(1200, 800, 1600)).toEqual({ ancho: 1200, alto: 800 })
  })

  it('achica una imagen más ancha que el máximo, manteniendo la proporción', () => {
    expect(calcularDimensionesRedimensionadas(3200, 2400, 1600)).toEqual({ ancho: 1600, alto: 1200 })
  })

  it('redondea el alto resultante', () => {
    expect(calcularDimensionesRedimensionadas(3000, 1000, 1600)).toEqual({ ancho: 1600, alto: 533 })
  })

  it('deja igual una imagen exactamente del ancho máximo', () => {
    expect(calcularDimensionesRedimensionadas(1600, 900, 1600)).toEqual({ ancho: 1600, alto: 900 })
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- lib/image/redimensionarImagen.test.ts`
Expected: FAIL — `Cannot find module './redimensionarImagen'`

- [ ] **Step 3: Implementación**

```typescript
// lib/image/redimensionarImagen.ts
export function calcularDimensionesRedimensionadas(
  anchoOriginal: number,
  altoOriginal: number,
  anchoMaximo: number
): { ancho: number; alto: number } {
  if (anchoOriginal <= anchoMaximo) return { ancho: anchoOriginal, alto: altoOriginal }
  const escala = anchoMaximo / anchoOriginal
  return { ancho: anchoMaximo, alto: Math.round(altoOriginal * escala) }
}

// No se testea unitariamente: depende de Image/canvas del DOM real del
// browser (jsdom no implementa decodificación de imágenes). Se verifica
// a mano en el navegador (ver plan, Task 10).
export async function redimensionarImagen(file: File, anchoMaximo = 1600): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const { ancho, alto } = calcularDimensionesRedimensionadas(bitmap.width, bitmap.height, anchoMaximo)

  if (ancho === bitmap.width && alto === bitmap.height) {
    bitmap.close()
    return file
  }

  const canvas = document.createElement('canvas')
  canvas.width = ancho
  canvas.height = alto
  const contexto = canvas.getContext('2d')
  if (!contexto) {
    bitmap.close()
    return file
  }
  contexto.drawImage(bitmap, 0, 0, ancho, alto)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) return file

  const nombreConExtension = file.name.replace(/\.\w+$/, '') + '.jpg'
  return new File([blob], nombreConExtension, { type: 'image/jpeg' })
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- lib/image/redimensionarImagen.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/image/redimensionarImagen.ts lib/image/redimensionarImagen.test.ts
git commit -m "feat: agregar redimensionado de imagen de factura en el browser"
```

---

### Task 6: Extraer el helper de autenticación de administrador

**Files:**
- Create: `lib/auth/requerirAdministrador.ts`
- Modify: `app/api/usuarios/route.ts:1-25`

**Interfaces:**
- Produces: `requerirAdministrador(): Promise<{ error: NextResponse; user?: undefined } | { error?: undefined; user: { id: string } }>`. Consumido por `app/api/usuarios/route.ts` (ya existente) y por `app/api/facturas/reconocer/route.ts` (Task 7).

- [ ] **Step 1: Crear el helper compartido**

```typescript
// lib/auth/requerirAdministrador.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { RolPerfil } from '@/types/database'

type ResultadoAuth =
  | { error: NextResponse; user?: undefined }
  | { error?: undefined; user: { id: string } }

export async function requerirAdministrador(): Promise<ResultadoAuth> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  }

  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
  if ((perfil as { rol: RolPerfil } | null)?.rol !== 'administrador') {
    return { error: NextResponse.json({ error: 'Acceso restringido' }, { status: 403 }) }
  }
  return { user }
}
```

- [ ] **Step 2: Usar el helper en `app/api/usuarios/route.ts`**

Reemplazá, en `app/api/usuarios/route.ts`, la función local `requerirAdministrador` (líneas 1-25 aproximadamente, desde los imports hasta el cierre de la función) por:

```typescript
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requerirAdministrador } from '@/lib/auth/requerirAdministrador'
import type { Perfil, RolPerfil } from '@/types/database'
```

y borrá la definición local de `requerirAdministrador` y del tipo `ResultadoAuth` (quedan solo en `lib/auth/requerirAdministrador.ts`). El resto del archivo (`GET`, `POST`, etc.) no cambia — ya llaman a `requerirAdministrador()` por nombre.

- [ ] **Step 3: Verificar que compila y no rompió nada**

Run: `npm run lint && npm test`
Expected: ambos sin errores (el refactor no cambia comportamiento, no hay tests que actualizar).

- [ ] **Step 4: Commit**

```bash
git add lib/auth/requerirAdministrador.ts app/api/usuarios/route.ts
git commit -m "refactor: extraer requerirAdministrador a un helper compartido"
```

---

### Task 7: API route de reconocimiento con Claude

**Files:**
- Create: `app/api/facturas/reconocer/route.ts`
- Modify: `.env.local.example`
- Modify: `package.json` (nueva dependencia)

**Interfaces:**
- Consumes: `requerirAdministrador()` (Task 6); `sanearFacturaDetectada(raw: unknown): FacturaDetectada` (Task 4); `createAdminClient()` (`lib/supabase/admin.ts`, ya existente).
- Produces: `POST /api/facturas/reconocer` — body `{ ruta_archivo: string }` → responde `200` con `{ ok: true; factura: FacturaDetectada }` o `{ ok: false; error: string }`; responde `401`/`403` si no hay sesión de administrador. Consumido por `lib/data/facturas.ts` (Task 8).

- [ ] **Step 1: Instalar la dependencia**

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Agregar la variable de entorno de ejemplo**

En `.env.local.example`, agregar al final:

```
ANTHROPIC_API_KEY=
```

Y en tu `.env.local` real (no versionado), agregar tu API key de Anthropic con facturación habilitada.

- [ ] **Step 3: Escribir la route**

```typescript
// app/api/facturas/reconocer/route.ts
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requerirAdministrador } from '@/lib/auth/requerirAdministrador'
import { createAdminClient } from '@/lib/supabase/admin'
import { sanearFacturaDetectada, type FacturaDetectada } from '@/lib/facturas/reconocimientoSchema'

const SEGUNDOS_VALIDEZ_URL_FIRMADA = 300

const HERRAMIENTA_EXTRAER_FACTURA = {
  name: 'extraer_factura',
  description: 'Extrae los datos de una factura de compra argentina (AFIP) a partir de su imagen.',
  input_schema: {
    type: 'object' as const,
    properties: {
      proveedor_nombre: { type: ['string', 'null'], description: 'Razón social del emisor de la factura.' },
      proveedor_cuit: { type: ['string', 'null'], description: 'CUIT del emisor, si figura impreso.' },
      tipo_comprobante: {
        type: ['string', 'null'],
        enum: ['Factura A', 'Factura B', 'Factura C', 'Remito', 'Nota de Credito', null],
      },
      numero_comprobante: { type: ['string', 'null'], description: 'Número de comprobante, ej. 0001-00012345.' },
      fecha: { type: ['string', 'null'], description: 'Fecha de emisión en formato YYYY-MM-DD.' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            descripcion: { type: 'string' },
            cantidad: { type: ['number', 'null'] },
            costo_unitario: { type: ['number', 'null'], description: 'Precio unitario sin IVA.' },
            alicuota_iva: { type: ['number', 'null'], description: 'Porcentaje de IVA de la línea (ej. 21).' },
          },
          required: ['descripcion'],
        },
      },
      subtotal: { type: ['number', 'null'] },
      iva_total: { type: ['number', 'null'] },
      total: { type: ['number', 'null'] },
    },
    required: ['items'],
  },
}

export async function POST(request: Request) {
  const { error } = await requerirAdministrador()
  if (error) return error

  const body = await request.json().catch(() => null)
  const rutaArchivo = (body as { ruta_archivo?: unknown } | null)?.ruta_archivo
  if (typeof rutaArchivo !== 'string' || rutaArchivo.length === 0) {
    return NextResponse.json({ error: 'Falta ruta_archivo' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const { data: urlFirmada, error: errorUrl } = await admin.storage
      .from('facturas-adjuntos')
      .createSignedUrl(rutaArchivo, SEGUNDOS_VALIDEZ_URL_FIRMADA)
    if (errorUrl || !urlFirmada) {
      return NextResponse.json({ ok: false, error: 'No se pudo acceder a la imagen subida.' })
    }

    const respuestaImagen = await fetch(urlFirmada.signedUrl)
    if (!respuestaImagen.ok) {
      return NextResponse.json({ ok: false, error: 'No se pudo descargar la imagen subida.' })
    }
    const bufferImagen = Buffer.from(await respuestaImagen.arrayBuffer())
    const tipoMedia = respuestaImagen.headers.get('content-type') ?? 'image/jpeg'

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const respuesta = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2048,
      system:
        'Sos un asistente que lee facturas de compra argentinas (formato AFIP) a partir de una foto y ' +
        'extrae sus datos con la herramienta extraer_factura. Si un campo no se lee con claridad, devolvé ' +
        'null para ese campo en vez de adivinar. Los montos van sin el símbolo $ ni separadores de miles.',
      tools: [HERRAMIENTA_EXTRAER_FACTURA],
      tool_choice: { type: 'tool', name: 'extraer_factura' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: tipoMedia as 'image/jpeg', data: bufferImagen.toString('base64') },
            },
            { type: 'text', text: 'Extraé los datos de esta factura.' },
          ],
        },
      ],
    })

    const usoHerramienta = respuesta.content.find((bloque) => bloque.type === 'tool_use')
    if (!usoHerramienta || usoHerramienta.type !== 'tool_use') {
      return NextResponse.json({ ok: false, error: 'Claude no devolvió datos estructurados.' })
    }

    const factura: FacturaDetectada = sanearFacturaDetectada(usoHerramienta.input)
    return NextResponse.json({ ok: true, factura })
  } catch (err) {
    console.error('Error reconociendo factura:', err)
    return NextResponse.json({ ok: false, error: 'No se pudo leer la factura automáticamente.' })
  }
}
```

- [ ] **Step 4: Verificar que compila**

Run: `npm run lint && npm run build`
Expected: sin errores de tipos ni de lint.

- [ ] **Step 5: Verificación manual (requiere `ANTHROPIC_API_KEY` real)**

Con `npm run dev` corriendo y sesión de administrador iniciada en el navegador:
1. Subí manualmente una foto de factura al bucket `facturas-adjuntos` (podés hacerlo desde el dashboard de Supabase Storage, o esperar a la Task 9 para hacerlo desde la UI).
2. Hacé `POST` a `/api/facturas/reconocer` con `{ "ruta_archivo": "<la-ruta-que-subiste>" }` (por ejemplo con `curl` incluyendo las cookies de sesión, o desde la consola del navegador con `fetch`).
3. Confirmá que la respuesta trae `ok: true` y un objeto `factura` con los campos esperados.

Esta verificación es manual porque depende de una API key real y de una imagen real (no determinística) — no se automatiza (ver spec, sección Testing).

- [ ] **Step 6: Commit**

```bash
git add app/api/facturas/reconocer/route.ts .env.local.example package.json package-lock.json
git commit -m "feat: agregar API de reconocimiento de facturas con Claude"
```

---

### Task 8: Funciones de datos para subir la foto y pedir el reconocimiento

**Files:**
- Modify: `lib/data/facturas.ts`

**Interfaces:**
- Consumes: `createClient()` de `@/lib/supabase/client` (ya usado en el archivo); tipo `FacturaDetectada` de `@/lib/facturas/reconocimientoSchema` (Task 4).
- Produces:
  - `subirFotoFactura(file: File): Promise<string>` — sube el archivo al bucket `facturas-adjuntos` y devuelve la ruta guardada.
  - `reconocerFactura(rutaArchivo: string): Promise<{ ok: true; factura: FacturaDetectada } | { ok: false; error: string }>` — llama a `POST /api/facturas/reconocer`.
  - Ambas consumidas por `app/(app)/compras/nueva/page.tsx` (Task 9).

- [ ] **Step 1: Agregar las funciones**

Agregar al final de `lib/data/facturas.ts` (después de `anularFactura`):

```typescript
import type { FacturaDetectada } from '@/lib/facturas/reconocimientoSchema'

export async function subirFotoFactura(file: File): Promise<string> {
  const supabase = createClient()
  const extension = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
  const ruta = `${crypto.randomUUID()}.${extension}`

  const { error } = await supabase.storage.from('facturas-adjuntos').upload(ruta, file)
  if (error) throw error
  return ruta
}

export async function reconocerFactura(
  rutaArchivo: string
): Promise<{ ok: true; factura: FacturaDetectada } | { ok: false; error: string }> {
  const respuesta = await fetch('/api/facturas/reconocer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ruta_archivo: rutaArchivo }),
  })
  if (!respuesta.ok) {
    return { ok: false, error: 'No se pudo leer la factura automáticamente.' }
  }
  const datos = await respuesta.json()
  if (!datos.ok) {
    return { ok: false, error: datos.error ?? 'No se pudo leer la factura automáticamente.' }
  }
  return { ok: true, factura: datos.factura as FacturaDetectada }
}
```

(el `import type { FacturaDetectada } ...` va arriba del archivo, junto a los demás imports).

- [ ] **Step 2: Verificar que compila**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add lib/data/facturas.ts
git commit -m "feat: agregar subirFotoFactura y reconocerFactura al cliente de datos"
```

---

### Task 9: Integrar la carga de foto en el formulario de nueva factura

**Files:**
- Modify: `app/(app)/compras/nueva/page.tsx`

**Interfaces:**
- Consumes: `subirFotoFactura`, `reconocerFactura` (Task 8); `emparejarProveedor`, `emparejarProducto` (Task 3); `redimensionarImagen` (Task 5); `FacturaDetectada` (Task 4).
- Produces: UI funcional en `/compras/nueva`; el `archivo_adjunto` de la factura guardada queda seteado a la ruta subida cuando se usó una foto.

- [ ] **Step 1: Agregar imports y estado nuevo**

En `app/(app)/compras/nueva/page.tsx`, agregar a los imports existentes:

```typescript
import { registrarFacturaCompra, subirFotoFactura, reconocerFactura, type NuevaFacturaItemInput } from '@/lib/data/facturas'
import { emparejarProveedor, emparejarProducto } from '@/lib/data/facturaMatching'
import { redimensionarImagen } from '@/lib/image/redimensionarImagen'
```

(`registrarFacturaCompra` y `NuevaFacturaItemInput` ya se importaban; solo se agregan `subirFotoFactura` y `reconocerFactura` al mismo import existente).

Dentro del componente, junto a los demás `useState`:

```typescript
const [fotoPreviewUrl, setFotoPreviewUrl] = useState<string | null>(null)
const [archivoAdjunto, setArchivoAdjunto] = useState<string | null>(null)
const [reconociendo, setReconociendo] = useState(false)
const [errorReconocimiento, setErrorReconocimiento] = useState<string | null>(null)
const [proveedorDetectadoTexto, setProveedorDetectadoTexto] = useState<string | null>(null)
```

- [ ] **Step 2: Agregar el handler de selección de foto**

Dentro del componente, junto a las demás funciones (`updateItem`, `addItem`, etc.):

```typescript
async function handleFotoSeleccionada(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file) return

  setFotoPreviewUrl(URL.createObjectURL(file))
  setErrorReconocimiento(null)
  setProveedorDetectadoTexto(null)
  setReconociendo(true)

  try {
    const fileRedimensionado = await redimensionarImagen(file)
    const ruta = await subirFotoFactura(fileRedimensionado)
    setArchivoAdjunto(ruta)

    const resultado = await reconocerFactura(ruta)
    if (!resultado.ok) {
      setErrorReconocimiento(resultado.error)
      return
    }

    const { factura: detectada } = resultado

    if (detectada.proveedor_nombre || detectada.proveedor_cuit) {
      const proveedorMatch = emparejarProveedor(
        { nombre: detectada.proveedor_nombre, cuit: detectada.proveedor_cuit },
        proveedores
      )
      if (proveedorMatch) {
        setProveedorId(proveedorMatch.id)
      } else {
        setProveedorDetectadoTexto(detectada.proveedor_nombre ?? detectada.proveedor_cuit)
      }
    }

    if (detectada.tipo_comprobante) setTipoComprobante(detectada.tipo_comprobante)
    if (detectada.numero_comprobante) setNumeroComprobante(detectada.numero_comprobante)
    if (detectada.fecha) setFecha(detectada.fecha)

    if (detectada.items.length > 0) {
      setItems(
        detectada.items.map((item) => {
          const productoMatch = emparejarProducto(item.descripcion, productos)
          return {
            producto_id: productoMatch?.id ?? '',
            productoTexto: productoMatch?.nombre ?? item.descripcion,
            cantidad: item.cantidad !== null ? String(item.cantidad) : '',
            costo_unitario: item.costo_unitario !== null ? String(item.costo_unitario) : '',
            alicuota_iva: item.alicuota_iva !== null ? String(item.alicuota_iva) : '21',
          }
        })
      )
    }
  } catch (err) {
    setErrorReconocimiento('No se pudo procesar la foto. Completá los datos a mano.')
  } finally {
    setReconociendo(false)
  }
}
```

- [ ] **Step 3: Agregar la UI, arriba del `<form>`**

Justo después del `<div className="rise">` del título (`<h1>Nueva factura de compra</h1>`) y antes de `<form onSubmit={handleSubmit} ...>`, agregar:

```tsx
<div className="card rise flex flex-col gap-3 p-5">
  <div className="flex items-center justify-between">
    <p className="text-sm font-semibold text-ink">Cargar foto de factura (opcional)</p>
    <label className="pill-btn ghost cursor-pointer">
      📷 Elegir foto
      <input type="file" accept="image/*" capture="environment" onChange={handleFotoSeleccionada} className="hidden" />
    </label>
  </div>
  {fotoPreviewUrl && (
    <div className="flex items-start gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={fotoPreviewUrl} alt="Foto de la factura" className="h-32 w-32 rounded-[var(--r-sm)] object-cover" />
      <div className="flex flex-col gap-1 text-sm">
        {reconociendo && <p className="text-ink-faint">Leyendo factura…</p>}
        {errorReconocimiento && <p className="text-negative">{errorReconocimiento}</p>}
        {proveedorDetectadoTexto && !reconociendo && (
          <p className="text-ink-faint">
            Detectado: <span className="text-ink">{proveedorDetectadoTexto}</span> — no encontrado en proveedores, elegilo o creá uno nuevo.
          </p>
        )}
        {!reconociendo && !errorReconocimiento && !proveedorDetectadoTexto && (
          <p className="text-ink-faint">Revisá los datos precargados abajo antes de guardar.</p>
        )}
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 4: Pasar `archivo_adjunto` al guardar**

En `handleSubmit`, dentro del llamado a `registrarFacturaCompra`, agregar el campo `archivo_adjunto`:

```typescript
const { id } = await registrarFacturaCompra({
  proveedor_id: proveedorId,
  numero_comprobante: numeroComprobante,
  tipo_comprobante: tipoComprobante,
  fecha,
  subtotal: totalesFinales.subtotal,
  iva_total: totalesFinales.ivaTotal,
  total: totalesFinales.total,
  archivo_adjunto: archivoAdjunto,
  items: itemsInput,
})
```

- [ ] **Step 5: Verificar que compila**

Run: `npm run lint && npm run build`
Expected: sin errores de tipos ni de lint.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/compras/nueva/page.tsx"
git commit -m "feat: agregar carga de foto de factura con reconocimiento en /compras/nueva"
```

---

### Task 10: Verificación manual end-to-end

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Levantar el entorno**

```bash
npm run dev
```

Confirmá que `ANTHROPIC_API_KEY` está seteada en `.env.local` con una key con facturación habilitada.

- [ ] **Step 2: Probar el flujo con foto**

1. Iniciá sesión como administrador y andá a `/compras/nueva`.
2. Tocá "📷 Elegir foto" y subí una foto real de una factura (podés usar alguna de `facturas planeta animal/*.PDF` convertida a imagen, o sacarle una foto a una factura en papel).
3. Confirmá que aparece la preview de la imagen y el estado "Leyendo factura…".
4. Confirmá que, al terminar, se precargan proveedor (o el aviso de "Detectado: ..." si no matcheó), tipo de comprobante, número, fecha e ítems.
5. Corregí manualmente cualquier campo que haya quedado mal o vacío, igual que harías con la carga 100% manual.
6. Guardá la factura y confirmá que redirige a `/compras/<id>` y que los datos guardados son los que quedaron en el formulario (no los originales detectados si los corregiste).

- [ ] **Step 3: Probar la carga manual sigue funcionando sin foto**

1. Volvé a `/compras/nueva` y cargá una factura completa a mano, sin tocar "Elegir foto".
2. Confirmá que se guarda igual que antes de este cambio.

- [ ] **Step 4: Probar el caso de error**

1. Subí una foto que no sea una factura (por ejemplo, una foto random) o simulá un fallo apagando momentáneamente `ANTHROPIC_API_KEY`.
2. Confirmá que aparece el mensaje de error y que el formulario queda vacío/editable — no debe romperse ni bloquear la carga manual.

- [ ] **Step 5: Correr toda la suite antes de dar por terminado**

```bash
npm run lint && npm test && npm run build
```

Expected: todo verde.
