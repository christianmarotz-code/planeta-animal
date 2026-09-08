# Fase 1 — Proveedores, Productos, Compras y Stock

## Contexto

Planeta Animal (veterinaria) hoy administra toda su información en **MyVete**, un ERP veterinario que cubre clientes/pacientes, historias clínicas, turnos, caja, ventas, compras, stock, proveedores, internación, reportes y mutualismo.

El objetivo de largo plazo es construir un sistema propio que cubra todas estas áreas, automatizando la carga de información y agregando funcionalidades que MyVete no resuelve bien (como follow-ups a clientes por WhatsApp). Dado el tamaño del proyecto, se construirá por fases, cada una con su propio diseño e implementación:

1. **Fase 1 (este documento):** Proveedores, Productos, Compras (facturas) y Stock.
2. Fase 2: Ventas / Ingresos.
3. Fase 3: Egresos generales (no ligados a compra de stock).
4. Fase 4: Empleados y roles (usuario administrador vs. empleados, permisos).
5. Fase 5: Follow-ups a clientes por WhatsApp.
6. Fase 6: Migración/integración con MyVete.

Durante la transición, el sistema nuevo convive **en paralelo** con MyVete: la veterinaria empieza a cargar compras y stock acá, mientras sigue usando MyVete para lo que esta fase todavía no cubre (turnos, historias clínicas, ventas, etc.), hasta migrar todo gradualmente.

## Alcance de la Fase 1

Permitir cargar facturas de compra a proveedores para que el sistema:
- Actualice el stock de productos automáticamente.
- Actualice el costo de los productos.
- Permita ver cuánto se gastó en compras (por período/proveedor) y cuánto vale el stock actual (costo total invertido).

**Fuera de alcance en esta fase:** ventas, caja/ingresos, balance financiero completo (ingresos vs. egresos), roles y permisos diferenciados, historias clínicas, turnos, WhatsApp, múltiples sucursales, lectura automática de facturas (OCR/IA).

## Contexto de uso

- **Usuarios:** 2 a 5 personas del equipo, todas con el mismo nivel de acceso (sin roles diferenciados todavía — eso llega en la Fase 4).
- **Dispositivos:** navegador web, tanto en celular/tablet como en PC (responsive, sin apps nativas).
- **Origen de las facturas:** mezcla de PDF, foto y papel/remito según el proveedor — no hay un formato único ni estructurado disponible.
- **Ubicación:** una sola sucursal/depósito.
- **Fiscal:** Argentina. Las facturas de compra deben registrar IVA, CUIT del proveedor y tipo de comprobante (Factura A/B/C, Remito, Nota de crédito), para que los reportes de gasto y stock sean fiscalmente correctos desde el inicio.
- **Unidades:** los productos pueden manejarse fraccionados (ej. se compra por caja/frasco pero se vende/consume por comprimido/ml).

## 1. Arquitectura

- **Next.js** (React) como aplicación web única y responsive — funciona igual desde celular, tablet o PC vía navegador (sin instalación, se puede "agregar a inicio" en el celular).
- **Supabase** como backend gestionado:
  - Base de datos **Postgres** (modelo relacional).
  - **Auth** para login por email/contraseña de los 2-5 usuarios.
  - **Storage** para guardar el archivo (foto/PDF) de cada factura como respaldo, aunque la carga de datos sea manual.
- **Vercel** para el despliegue del frontend (plan gratuito suficiente para este volumen de uso).

Se eligió este enfoque (un único proyecto full-stack) en vez de separar backend/frontend porque hay un solo equipo construyendo, un solo tipo de cliente (navegador web) y esto reduce a la mitad la cantidad de servicios a mantener. Separar backend y frontend solo se justificaría si en el futuro cercano se necesitara una app móvil nativa independiente consumiendo la misma lógica de negocio, lo cual no está planeado.

## 2. Modelo de datos

### Proveedores
`id, nombre, cuit, telefono, email, direccion, notas`

### Productos
`id, nombre, categoria, unidad_compra (ej. "caja", "frasco"), unidad_stock (ej. "comprimido", "ml"), factor_conversion (ej. 1 caja = 30 comprimidos), stock_actual (en unidad_stock), stock_minimo, costo_unitario_actual (en unidad_stock), alicuota_iva, activo`

Si un producto no se fracciona, `unidad_compra = unidad_stock` y `factor_conversion = 1` — el mismo modelo cubre ambos casos sin lógica especial.

### Facturas de Compra
`id, proveedor_id, numero_comprobante, tipo_comprobante (Factura A/B/C, Remito, Nota de credito), fecha, subtotal, iva_total, total, estado, archivo_adjunto (opcional), notas`

### Items de Factura
`id, factura_id, producto_id, cantidad (en unidad_compra), costo_unitario (en unidad_compra), alicuota_iva, subtotal`

Al guardar una factura, cada ítem genera un movimiento de stock (entrada) y actualiza `stock_actual` y `costo_unitario_actual` del producto correspondiente (convertido a `unidad_stock` vía `factor_conversion`).

### Movimientos de Stock
`id, producto_id, tipo (entrada por compra / ajuste manual), cantidad (en unidad_stock), fecha, origen (factura_id o motivo de ajuste), usuario_id`

Registro histórico auditable: `stock_actual` de un producto es siempre la suma de sus movimientos. Permite ajustes manuales (rotura, vencimiento, conteo físico) sin necesidad de una factura.

### Usuarios
`id, nombre, email` — autenticación vía Supabase Auth. Sin roles/permisos diferenciados en esta fase; todo usuario logueado tiene el mismo acceso.

## 3. Flujos principales (pantallas)

- **Login** — email/contraseña.
- **Proveedores** — listado, alta/edición, ficha con historial de compras.
- **Productos** — listado con filtro por categoría/stock bajo, alta/edición.
- **Nueva Factura de Compra** — elegir proveedor → cargar datos del comprobante (número, tipo, fecha) → agregar ítems (producto, cantidad, costo unitario — calcula subtotal/IVA/total automáticamente) → adjuntar foto/PDF opcional → guardar (actualiza stock y costo al instante). Si un producto mencionado no existe todavía, se puede crear "al vuelo" desde el mismo formulario.
- **Listado de Facturas** — filtro por proveedor/fecha, ver detalle. Una factura guardada no se edita — se anula y se carga una corrección, para mantener el historial confiable.
- **Stock** — listado de productos con cantidad actual, valor total (cantidad × costo), alerta visual si está bajo el mínimo; permite ajuste manual con motivo obligatorio.
- **Reportes** — gasto en compras por período/proveedor, valor total del stock actual, productos con stock bajo.

## 4. Manejo de errores y validaciones

- No se puede guardar una factura sin al menos un ítem, ni con cantidades o costos en cero o negativos.
- Los totales de la factura (subtotal, IVA, total) se calculan automáticamente a partir de los ítems — no se cargan a mano, evitando descuadres.
- Todo ajuste manual de stock requiere un motivo (texto obligatorio) para quedar auditado.

## 5. Testing

- Tests automáticos sobre la lógica de cálculo: conversión de unidades, actualización de stock/costo al guardar una factura, cálculo de IVA — es la parte con mayor riesgo de errores silenciosos.
- Verificación manual de los flujos de pantalla (alta de proveedor/producto, carga de factura, ajuste de stock) antes de dar por cerrada la fase.
