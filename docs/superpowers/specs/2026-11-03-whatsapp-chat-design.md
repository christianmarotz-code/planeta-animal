# Chat de WhatsApp en el sistema: diseño

Fecha: 2026-11-03. Estado: aprobado en conversación, pendiente de revisión del documento.

## Objetivo

Una sección `/whatsapp` donde el equipo habla con clientes y proveedores desde el sistema, usando el número del negocio vinculado por QR (dispositivo vinculado, como WhatsApp Web). Sin API oficial de Meta.

## Alcance de la v1

Entra:

1. Bandeja de chats: lista de conversaciones, chat, historial guardado, no leídos.
2. Vínculo de cada chat con un cliente o proveedor por teléfono.
3. Envío de pedido a proveedor desde Reposición, con mensaje editable.
4. Mensajes automáticos: saludo inicial y fuera de horario.

No entra (queda para una etapa posterior):

- Fotos, audios y documentos. Se muestran como "📷 imagen recibida" y similares; solo se guarda texto.
- Difusiones masivas o envíos a listas.
- Más de un número vinculado.

## Arquitectura

```
Celular (QR) ──► Gateway WhatsApp (Evolution API, servidor chico, siempre prendido)
                       │ webhook: mensaje nuevo              ▲ enviar mensaje
                       ▼                                     │
              Next.js en Vercel: /api/whatsapp/webhook ──► Supabase (mensajes)
                       ▲                                     │
                       └──── pantalla /whatsapp (bandeja) ◄──┘
```

- **Gateway:** único componente fuera de Vercel y Supabase. Mantiene la sesión del QR, reconecta solo y expone una API de envío. Vercel no puede sostener esa conexión permanente. Costo estimado: unos US$5 por mes (Railway, Fly o VPS).
- **Webhook** `/api/whatsapp/webhook/<secreto>`: el secreto compartido viaja en la URL (así funciona con cualquier versión del gateway) y se compara en tiempo constante. Sin el secreto correcto, rechaza y no guarda nada. `proxy.ts` hoy manda al login toda petición sin sesión, así que esta ruta se exime a propósito de ese chequeo.
- **Envío:** siempre desde el servidor del sistema, nunca desde el navegador, para no exponer las claves del gateway. Cada envío registra qué usuario lo mandó.
- **Pantalla `/whatsapp`:** lista de chats a la izquierda, conversación a la derecha, actualizada en tiempo real con Supabase Realtime.

## Datos

Migración nueva (la siguiente a la 0039), con RLS activado desde su creación.

- `whatsapp_conversaciones`: un registro por número. Teléfono normalizado, nombre que muestra WhatsApp, `proveedor_id` y `cliente_id` (nulos si no hay coincidencia), fecha del último mensaje, contador de no leídos.
- `whatsapp_mensajes`: `conversacion_id`, dirección (entrante o saliente), texto, estado (en la v1: pendiente, enviado o error; "entregado" y "leído" quedan permitidos en la tabla pero todavía no se actualizan), usuario que lo mandó (nulo si es entrante o automático), origen (entrante, manual, pedido o automático), regla que lo disparó (si es automático), id de mensaje de WhatsApp con restricción de único para que un webhook repetido no duplique. Lo que se escribe desde el celular también aparece en el chat.
- `whatsapp_reglas`: texto de la respuesta automática, tipo de disparador (saludo inicial o fuera de horario), horario y días configurables, activa o no. El tope es fijo: una vez cada 24 h por conversación. Más una tabla de configuración con el interruptor general, apagado por defecto.

### Vínculo por teléfono

Las tablas `proveedores` y `clientes` ya tienen `telefono`. La coincidencia se hace por los **últimos 8 dígitos** (no 10: con el "15" de los teléfonos escritos a mano, `011 15 4444-5555`, los últimos 10 dígitos no coinciden con `+54 9 11 4444-5555`). Solo se vincula si hay exactamente una coincidencia entre proveedores y clientes; ante la duda, queda "sin vincular". Un número sin coincidencia se puede asociar a mano a un cliente o proveedor, o crear el cliente desde ahí.

## Permisos

| Acción | Quién |
|---|---|
| Ver chats, responder, ver si WhatsApp está conectado | Cualquier usuario con sesión |
| Mandar pedido a un proveedor desde Reposición | Solo administrador (la pantalla Reposición ya es solo de administradores; la API también lo exige) |
| Vincular el número (QR), crear o editar reglas automáticas | Solo administrador |

Coherente con las decisiones previas: sistema cerrado, pocos usuarios de confianza, lectura abierta a quien tiene sesión.

## Pedido a proveedor desde Reposición

- Botón "Pedir por WhatsApp" en cada grupo de proveedor de la pantalla Reposición, que ya agrupa los productos a reponer por proveedor (`agruparReposicionSugerida`, confirmado en el código). Esa pantalla es solo de administradores.
- El teléfono del proveedor se convierte al formato de WhatsApp (celular argentino: 549 + área + número). Si no se reconoce como celular argentino, no se envía y el botón pide revisarlo.
- Arma un mensaje con productos y cantidades, editable antes de enviar. Nunca sale solo.
- Va al `telefono` del proveedor; si no tiene, el botón pide cargarlo.
- Queda en el chat del proveedor con origen "pedido" y el usuario que lo mandó.
- El stock actual es provisorio hasta el inventario real, así que los pedidos van a salir ruidosos por ahora; la confirmación manual es obligatoria.

## Mensajes automáticos

- Reglas: saludo inicial (primer mensaje de un número) y fuera de horario.
- Solo las edita el administrador.
- Cuidado del número:
  - Solo responden a quien escribió primero.
  - Máximo una vez por conversación cada 24 h por regla.
  - Pausa de 2 a 6 segundos antes de enviar.
  - Nunca se mandan a proveedores.
  - Interruptor general para apagar todo.
- Sin difusiones masivas ni listas.

## Riesgos

- Vincular por QR es el mecanismo de dispositivo vinculado, no una API oficial. Meta no lo permite formalmente y puede bloquear el número del negocio. Se mitiga con los límites de arriba.
- El celular debe mantener internet para que la sesión siga viva.
- Los mensajes que llegan con el gateway caído se entregan cuando la sesión vuelve.

## Errores

- Gateway caído o sesión desvinculada: aviso fijo arriba en la pantalla; el administrador puede volver a escanear el QR.
- Envío fallido: el mensaje queda marcado con error y botón "Reintentar", sin pérdida ni duplicado.
- Webhook repetido: no duplica, por la restricción de único.
- Webhook sin secreto correcto: se rechaza.

## Pruebas

- vitest: normalización de teléfonos, vínculo por últimos 10 dígitos, idempotencia del webhook, límites de las reglas.
- Pruebas de RLS en el estilo de las de la migración 0039.
- Playwright con un gateway falso que simula mensajes entrantes y salientes, sin tocar un WhatsApp real.

## Notas para la implementación

- `AGENTS.md` avisa que esta versión de Next.js tiene cambios incompatibles: leer la guía relevante en `node_modules/next/dist/docs/` antes de escribir rutas o código.
- Las migraciones las pega el usuario en el SQL Editor de Supabase; la verificación posterior es un `select`.
- La CSP (Report-Only) ya permite el websocket de Supabase en `connect-src`, así que Realtime no necesita cambios.
- Los nombres exactos de campos de Evolution API no se pudieron confirmar en su documentación; el plan empieza verificándolos contra una instancia real y los aísla en `lib/whatsapp/entrante.ts` y `lib/whatsapp/gateway.ts`.
- `types/supabase.ts` es generado: se regenera después de aplicar la migración.
