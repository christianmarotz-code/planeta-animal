# Reconocimiento de facturas por foto

## Contexto

Hoy, en `/compras/nueva`, el administrador carga una factura de compra a mano: elige proveedor, tipo de comprobante, número, fecha y cada ítem (producto, cantidad, costo, alícuota de IVA). Al guardar, `registrarFacturaCompra` (RPC `registrar_factura_compra`) inserta la factura, sus ítems, genera movimientos de stock y actualiza el costo/stock de cada producto.

Se pidió poder sacarle una foto a la factura en papel y que el sistema "la reconozca", dejando que el admin revise y corrija antes de cargarla definitivamente.

## Alcance

- Solo administradores pueden subir la foto (mismo control de acceso que ya existe en `/compras/nueva` vía `useEsAdministrador`).
- El reconocimiento usa la API de Claude (modelo Sonnet, visión) para extraer los datos de la imagen.
- El resultado del reconocimiento **solo pre-llena el formulario existente**. No se guarda nada en la base de datos hasta que el admin revisa y aprieta "Guardar factura" (el flujo y la RPC actuales no cambian).
- No se crea ningún estado "pendiente de aprobación" ni tabla nueva: como solo el admin sube y revisa, y lo hace en la misma sesión, alcanza con precargar el formulario que ya existe.
- Fuera de alcance: reconocimiento en lote de varias facturas a la vez, edición retroactiva de facturas ya cargadas, soporte para proveedores/productos que no existen en el catálogo (se resuelven con el flujo manual ya existente de "crear producto rápido").

## Arquitectura

```
[Admin] → sube/saca foto en /compras/nueva
        → (browser) redimensiona la imagen a máx. 1600px de ancho
        → sube a Storage bucket privado "facturas-adjuntos" (RLS: solo admin)
        → POST /api/facturas/reconocer { ruta_archivo }
              ↳ valida sesión + rol administrador (mismo patrón que /api/usuarios)
              ↳ genera URL firmada de la imagen desde Storage
              ↳ llama a Claude (Sonnet, visión) con prompt específico para facturas AFIP
              ↳ devuelve JSON estructurado (o error)
        → el formulario existente se pre-llena con lo devuelto
        → admin revisa/corrige cada campo como si lo hubiera tipeado
        → admin aprieta "Guardar factura" (sin cambios: registrarFacturaCompra)
```

### 1. Storage: bucket `facturas-adjuntos`

Nueva migración de Supabase, mismo patrón que el bucket `avatars` (`0006_perfiles.sql`), pero:
- Bucket **privado** (`public: false`) — las facturas pueden tener datos comerciales sensibles.
- Política de `insert`/`select` restringida a usuarios con `rol = 'administrador'` en `perfiles` (no alcanza con "el dueño de la carpeta", como en avatars, porque cualquier admin debe poder ver facturas subidas por otro admin).
- Ruta de archivo: `<factura_provisoria_id>/<timestamp>.<ext>` (se genera un UUID en el cliente antes de subir, ya que la factura real todavía no existe en ese momento).

### 2. API route: `app/api/facturas/reconocer/route.ts`

- `POST`, recibe `{ ruta_archivo: string }`.
- Reutiliza el helper `requerirAdministrador()` (se extrae de `app/api/usuarios/route.ts` a un módulo compartido `lib/auth/requerirAdministrador.ts` para no duplicarlo).
- Genera una URL firmada de corta duración para la imagen en `facturas-adjuntos` usando el cliente admin de Supabase.
- Llama a la API de Claude (`@anthropic-ai/sdk`, nueva dependencia) con la imagen y un prompt que pide extraer, en JSON estricto (vía `tool_choice` forzado a una tool con JSON Schema):
  - `proveedor_nombre`, `proveedor_cuit`
  - `tipo_comprobante` (mapeado a los valores válidos: Factura A/B/C, Remito, Nota de Crédito)
  - `numero_comprobante`, `fecha` (ISO `YYYY-MM-DD`)
  - `items`: lista de `{ descripcion, cantidad, costo_unitario, alicuota_iva }`
  - `subtotal`, `iva_total`, `total` (si figuran impresos en la factura)
- Si Claude no devuelve JSON válido o la llamada falla (red, rate limit, imagen ilegible), la ruta responde `200` con `{ ok: false, error: '...' }` en vez de `500`, para que el frontend caiga a formulario vacío sin romper la carga manual.
- Variable de entorno nueva: `ANTHROPIC_API_KEY` (server-only, no `NEXT_PUBLIC_`).

### 3. Frontend: `/compras/nueva`

- Nuevo bloque arriba del formulario: botón "📷 Cargar foto de factura" (`<input type="file" accept="image/*" capture="environment">`, funciona tanto para elegir archivo como para sacar foto en mobile).
- Al seleccionar imagen:
  1. Se redimensiona en el browser (canvas, máx. 1600px de ancho, mismo formato) para acotar costo/latencia de la llamada a Claude y el tamaño subido.
  2. Se sube al bucket `facturas-adjuntos`.
  3. Se muestra estado "Leyendo factura…" (spinner) mientras se llama a `/api/facturas/reconocer`.
  4. Con la respuesta:
     - **Proveedor**: se busca en la lista ya cargada de `proveedores` por CUIT exacto, o si no, por coincidencia aproximada de nombre (normalizando mayúsculas/acentos). Si hay match, se preselecciona `proveedorId`. Si no, el campo queda vacío y se muestra un texto auxiliar "Detectado: {proveedor_nombre}" debajo del selector para que el admin lo busque o cree manualmente (el alta de proveedor ya existe en `/proveedores/nuevo`, no se duplica acá).
     - **Tipo de comprobante, número, fecha**: se precargan directo en los inputs existentes.
     - **Ítems**: por cada ítem detectado se agrega una fila (`ItemDraft`) con `cantidad`, `costo_unitario`, `alicuota_iva` precargados. Para `producto_id` se intenta el mismo tipo de match aproximado por nombre contra la lista de `productos`; si matchea, se preselecciona; si no, la fila queda con el nombre detectado visible en el campo de búsqueda de producto (reutilizando el combobox existente) para que el admin lo vincule o dispare "crear producto rápido", igual que hoy.
  5. Si el reconocimiento falla, se muestra un mensaje breve ("No se pudo leer la factura automáticamente, completá los datos a mano") y el formulario queda vacío como si no se hubiera usado la foto — no bloquea la carga manual.
- Al guardar la factura, se agrega la `ruta_archivo` del bucket como `archivo_adjunto` (el campo ya existe en `NuevaFacturaInput` y en la tabla `facturas_compra`, hoy no se usaba desde el frontend).
- Nada de esto es obligatorio: el admin puede seguir cargando la factura 100% a mano, sin foto, como hasta ahora.

## Manejo de errores

- Falla de red/subida al bucket → mensaje de error inline, no se llama a Claude, formulario sigue vacío/editable.
- Falla de Claude (timeout, rate limit, respuesta no parseable) → la API responde `ok: false`; el frontend limpia el estado de carga y avisa, sin popular el formulario.
- Datos parcialmente reconocidos (ej. sin ítems o sin proveedor) → se precarga lo que sí vino; los campos faltantes quedan vacíos para completar a mano, igual que si el admin nunca hubiera usado la foto para esa parte.
- Montos/cantidades que Claude devuelva con formato inválido (texto no numérico) se descartan campo por campo (no se precargan) en vez de romper el parseo de toda la respuesta.

## Testing

- Unit test para la función de matching aproximado de proveedor/producto por nombre (normalización, casos sin match, casos con CUIT exacto).
- Unit test para el parseo/saneamiento de la respuesta de Claude en la API route (JSON incompleto, tipos inválidos, campos faltantes) — se testea la función de parseo aislada, sin llamar a la API real de Anthropic.
- No se agregan tests end-to-end contra la API real de Claude (hay costo y no-determinismo); se verifica manualmente con una foto real durante el desarrollo.

## Variables de entorno nuevas

- `ANTHROPIC_API_KEY` — server-only, se configura en Vercel/entorno de despliegue y en `.env.local` para desarrollo.

## Dependencias nuevas

- `@anthropic-ai/sdk` (cliente oficial de Anthropic para Node/TypeScript).
