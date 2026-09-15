# Fase 2 — Ventas / Ingresos

## Contexto

La Fase 1 cubrió Proveedores, Productos, Compras (facturas) y Stock — es decir, todo el lado de **egresos** ligados a mercadería. El sistema hoy puede decir cuánto se gastó y cuánto vale el stock, pero no tiene ninguna noción de **ingresos**: no existe módulo de ventas, ni de servicios (consultas, vacunas, cirugías, lavado de animales), ni de clientes. Todos los reportes de rentabilidad quedan incompletos sin este lado.

Esta fase agrega el registro de ventas — tanto de productos de petshop como de servicios clínicos y no clínicos (incluido el lavado de animales) — para poder cruzar ingresos contra egresos y calcular rentabilidad real, y para responder preguntas operativas concretas como "¿en qué meses se usa más el lavadero?".

Sigue el roadmap definido en la Fase 1 ([2026-09-08-compras-stock-fase1-design.md](2026-09-08-compras-stock-fase1-design.md)):

1. Fase 1: Proveedores, Productos, Compras y Stock.
2. **Fase 2 (este documento):** Ventas / Ingresos.
3. Fase 3: Egresos generales (no ligados a compra de stock).
4. Fase 4: Empleados y roles.
5. Fase 5: Follow-ups a clientes por WhatsApp.
6. Fase 6: Migración/integración con MyVete.

## Alcance de la Fase 2

Permitir registrar ventas de petshop y servicios (clínicos y no clínicos, incluido lavado de animales) para que el sistema:
- Descuente el stock automáticamente cuando se vende un producto.
- Calcule el margen de cada venta de producto usando el costo real vigente.
- Permita ver cuánto se facturó (por período, por medio de pago, por rama) y cruzarlo contra el gasto ya existente para obtener rentabilidad neta.
- Permita medir la frecuencia de uso de servicios puntuales (en particular, el lavado de animales) por semana y por mes, para identificar estacionalidad.

**Fuera de alcance en esta fase:**
- Pago dividido por venta (una venta tiene un único medio de pago).
- Cuenta corriente de clientes / ventas a crédito con saldo.
- Costeo de insumos usados en un servicio (el margen de un servicio es su precio completo, sin descontar costo).
- Corte de reportes por empleado o por tamaño de animal.
- Integración con caja/POS o medios de pago electrónicos (la carga es manual, post-cobro).
- Historias clínicas, turnos, múltiples sucursales.

## Contexto de uso

- Mismos usuarios y dispositivos que la Fase 1 (2-5 personas, sin roles diferenciados todavía, navegador web responsive).
- La venta se carga **manualmente después de cobrar** — no hay integración con caja ni con medios de pago electrónicos.
- El cliente es **opcional**: se puede cargar (nombre/teléfono) si el cajero quiere identificar al comprador, pero no bloquea la venta si no se carga.
- Medios de pago a distinguir: efectivo, tarjeta (débito/crédito), transferencia/Mercado Pago.
- Los servicios (consulta, vacuna, cirugía, lavado, etc.) no tienen stock ni unidad de compra — son un catálogo de precios, no un inventario.

## 1. Arquitectura

Misma arquitectura que la Fase 1: Next.js + Supabase (Postgres + Auth + Storage), desplegado en Vercel. No se introduce ningún componente nuevo de infraestructura — este módulo extiende el mismo esquema y las mismas convenciones (RPCs transaccionales para operaciones compuestas, RLS por rol, funciones de cálculo puras y testeadas por separado de las de acceso a datos).

## 2. Modelo de datos

### Servicios (nuevo)
`id, nombre, categoria, rama ('clinica'|'petshop'), precio, activo, created_at`

Catálogo de servicios sin stock: consultas, vacunas, cirugías, lavado de animales, etc. Estructuralmente análogo a `productos` pero sin campos de stock/unidad/conversión.

### Clientes (nuevo)
`id, nombre, telefono, email, created_at`

Registro simple, sin cuenta corriente. `telefono` y `email` son opcionales.

### Ventas (nuevo)
`id, cliente_id (nullable, FK a clientes), fecha, medio_pago ('efectivo'|'tarjeta'|'transferencia'), subtotal, iva_total, total, estado ('confirmada'|'anulada'), notas, created_at, created_by`

Un único `medio_pago` por venta. `estado` sigue el mismo patrón que `FacturaCompra.estado` (`'cargada'|'anulada'`), adaptado a `'confirmada'|'anulada'`.

### Items de Venta (nuevo)
`id, venta_id (FK a ventas), tipo ('producto'|'servicio'), producto_id (nullable, FK a productos), servicio_id (nullable, FK a servicios), cantidad, precio_unitario, costo_unitario_snapshot (nullable), subtotal`

Constraint: exactamente uno de `producto_id`/`servicio_id` debe estar seteado, según `tipo` (`CHECK` en SQL). `costo_unitario_snapshot` solo aplica a ítems tipo `producto` — se congela al momento de la venta con el `costo_unitario_actual` vigente del producto, para que el margen histórico no cambie si después se actualiza el costo. Los ítems tipo `servicio` no tienen costo asociado: su margen es el 100% del `precio_unitario`.

### Movimientos de Stock (extensión)
Se agrega el valor `'salida_venta'` al enum `tipo_movimiento_stock` existente (hoy `'entrada_compra'|'ajuste_manual'`). Cada venta de un ítem `tipo='producto'` genera un movimiento `'salida_venta'` con cantidad negativa, y decrementa `productos.stock_actual` — mismo mecanismo ya usado por las compras.

## 3. Backend: RPCs y lógica de negocio

Sigue el mismo patrón que `registrar_factura_compra` / `ajustar_stock_manual` de la Fase 1: operaciones que tocan más de una tabla se hacen vía RPC transaccional en Postgres, nunca como múltiples inserts sueltos desde el cliente.

- **`registrar_venta(payload)`**: inserta la venta y sus `items_venta` en una sola transacción. Por cada ítem `tipo='producto'`:
  - Valida que `productos.stock_actual >= cantidad`. Si algún producto no tiene stock suficiente, **toda la transacción se aborta** (no se permiten ventas parciales) y se devuelve un error indicando qué producto falló.
  - Descuenta `stock_actual` y crea el `movimiento_stock` tipo `'salida_venta'`.
  - Congela `costo_unitario_actual` en `costo_unitario_snapshot`.
- **`anular_venta(venta_id)`**: marca `estado='anulada'` y repone el stock de los ítems tipo `producto` con un movimiento inverso — análogo a `anularFactura()` de la Fase 1.
- **`lib/calc/venta.ts`** (nuevo): funciones puras de cálculo — subtotal de ítem, margen de ítem (`(precio_unitario - costo_unitario_snapshot) * cantidad` para productos, `precio_unitario * cantidad` para servicios), margen total de una venta.
- **`lib/data/ventas.ts`, `lib/data/servicios.ts`, `lib/data/clientes.ts`** (nuevos): `registrarVenta`, `listarVentas(filtros)`, `obtenerVentaConItems`, `anularVenta`, `listarServicios`, `crearServicio`, `listarClientes`, `crearCliente` — mismo estilo que `facturas.ts`/`proveedores.ts` de la Fase 1 (funciones async que envuelven `supabase.from(...)` o `supabase.rpc(...)`).
- **RLS**: se extienden las políticas de la migración `0015_restringir_escrituras_por_rol.sql` para cubrir `ventas`, `items_venta`, `servicios`, `clientes` con el mismo criterio de roles ya definido para compras.

## 4. Pantallas (App Router)

Mismo patrón visual y de componentes que `/compras`:

- **`/ventas`**: listado con filtros (fecha, cliente, medio de pago, rama, tipo de ítem) y totales del período visible.
- **`/ventas/nueva`**: buscador de producto/servicio (precio precargado, editable), selección de cliente opcional (autocompletar existente o alta rápida sin salir del flujo), medio de pago, cantidad por ítem, total calculado en vivo. Bloquea el submit si algún producto no tiene stock suficiente, mostrando qué producto falta — mismo estilo de validación que `/compras/nueva`.
- **`/ventas/[id]`**: detalle de la venta, con acción de anular.
- **`/servicios`** y **`/servicios/nuevo`**: ABM del catálogo de servicios (nombre, categoría, rama, precio, activo) — igual que `/productos` pero sin campos de stock.
- **`/clientes`**: listado simple; alta rápida también disponible inline desde `/ventas/nueva`.

## 5. Reportes e impacto en Dashboard

Se extiende `lib/data/reportes.ts` con el mismo estilo que las funciones de gasto ya existentes (`calcularGastoPorSemana`, `calcularGastoPorMes`, etc.):

- `calcularIngresoPorSemana(ventas, fecha)` / `calcularIngresoPorMes(ventas, año, mes)` / `calcularIngresoPorTrimestre(ventas, año, trimestre)`: mismo agrupador temporal que ya usa `inicioSemana()`, aplicado a `ventas.total` en vez de `facturas.total`.
- `calcularRentabilidadPorRama(ventas, facturas, gastos)`: ingreso por rama − costo de mercadería vendida (suma de `costo_unitario_snapshot * cantidad` de ítems producto) − gasto de la rama (reutiliza `calcularGastoPorProveedorPorRama`).
- `calcularVentasPorMedioPago(ventas, periodo)`: total por `medio_pago`, para arqueo de caja.
- `calcularFrecuenciaServicioPorSemana(ventas, servicioId)` / `calcularFrecuenciaServicioPorMes(ventas, servicioId, año)`: cantidad de veces que se vendió el servicio y cantidad total de unidades (animales) por semana/mes. Se usa de forma genérica para cualquier servicio, y en particular para "Lavado" — permite ver en qué meses se usa más el lavadero sin necesitar un reporte especial.

**Dashboard** (`app/(app)/page.tsx`): se agregan tarjetas de ingreso semanal/mensual junto a las de gasto ya existentes, más una tarjeta de **neto** (ingreso − egreso) por período. La página de Reportes agrega un gráfico de frecuencia de lavados por semana y por mes.

## 6. Validaciones y manejo de errores

- Una venta debe tener al menos 1 ítem.
- `cantidad > 0` y `precio_unitario >= 0` en cada ítem.
- Stock insuficiente en cualquier producto de la venta bloquea toda la transacción (no hay ventas parciales ni stock negativo).
- Anular una venta repone el stock exactamente como se descontó al confirmarla.
- El `costo_unitario_snapshot` se congela en el momento de la venta y no se recalcula retroactivamente si cambia el costo del producto — mismo criterio que `costo_unitario` en `ItemFactura`.

## 7. Testing

Mismo enfoque que la Fase 1 (Vitest, foco en lógica de cálculo pura sin mockear la base):

- `lib/calc/venta.test.ts`: subtotal de ítem, margen de ítem (producto vs. servicio), margen total de una venta.
- `lib/data/reportes.test.ts` (extendido): ingreso por semana/mes/trimestre, rentabilidad por rama, ventas por medio de pago, frecuencia de servicio por semana/mes (incluyendo el caso de lavado con varias ventas en la misma semana y meses distintos).
- Checks manuales de flujo para las RPCs transaccionales: registrar venta con stock insuficiente (debe abortar sin tocar el stock), registrar venta válida y verificar descuento de stock, anular venta y verificar reposición exacta.
