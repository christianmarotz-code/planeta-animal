# WhatsApp: operación del gateway

## Cómo funciona

El número del negocio se vincula por QR a un gateway Evolution API que corre en un servidor propio
(no en Vercel, porque necesita una conexión permanente). El gateway avisa por webhook a
`/api/whatsapp/webhook/<secreto>`; el sistema guarda los mensajes en Supabase y la pantalla
`/whatsapp` los muestra en tiempo real. Los envíos salen siempre por `/api/whatsapp/enviar`.

- **Quién ve qué:** cualquier usuario con sesión ve los chats, responde y ve si WhatsApp está
  conectado. Solo el administrador vincula el número (`/whatsapp/conexion`), edita las respuestas
  automáticas (`/whatsapp/automaticos`) y manda pedidos a proveedores desde Reposición.
- **Datos:** tablas `whatsapp_conversaciones`, `whatsapp_mensajes`, `whatsapp_reglas` y
  `whatsapp_config` (migración 0040). Los mensajes los escribe solo el servidor con la
  `service_role`; las dos funciones SQL (`whatsapp_registrar_mensaje`, `whatsapp_buscar_vinculo`)
  se ejecutan solo con esa clave, a propósito (excepción a la regla de "solo `authenticated`").

## Estado de verificación

**Lo que está probado:** la lógica (`npm test`), los permisos de la base (`supabase/tests/rls.sql`)
y el flujo completo contra un gateway **falso** que yo mismo escribí: webhook, vínculo por
teléfono, saludo automático una sola vez, envío manual, pedido a proveedor, reintento y las dos
pantallas de administrador.

**Lo que NO está probado:** nada se probó contra un Evolution API real, y su documentación no
se pudo consultar (las páginas v2 daban 404). El código asume lo siguiente; antes de usarlo en
serio, confirmarlo contra una instancia real y ajustar `lib/whatsapp/gateway.ts` y
`lib/whatsapp/entrante.ts` si algo difiere:

| Qué | Lo que se asume | Dónde |
|---|---|---|
| Enviar texto | `POST /message/sendText/<instancia>` con cabecera `apikey` y cuerpo `{ number, text }`; el id del mensaje viene en `key.id` | `gateway.ts` |
| Estado de conexión | `GET /instance/connectionState/<instancia>`; el estado viene en `instance.state` (`open`, `connecting`, `close`) | `gateway.ts` |
| QR | `GET /instance/connect/<instancia>`; la imagen viene en `base64` o `qrcode.base64` | `gateway.ts` |
| Aviso de mensaje | cuerpo con `event` = `messages.upsert` (o `MESSAGES_UPSERT`) y `data.key.remoteJid`, `data.key.fromMe`, `data.key.id`, `data.pushName`, `data.message.conversation` | `entrante.ts` |
| Números ocultos | si `remoteJid` termina en `@lid`, el número real viene en `data.key.remoteJidAlt` | `entrante.ts` |
| Mensajes propios | lo que se escribe desde el celular también llega como `messages.upsert` con `fromMe: true` | `entrante.ts` |

Para verificarlo: levantar Evolution API con Docker (el `docker-compose` del repositorio oficial
`EvolutionAPI/evolution-api`), vincular un celular de prueba, apuntar el webhook a un
escuchador que guarde los cuerpos, y comparar con la tabla de arriba.

## Variables de entorno (Vercel y `.env.local`)

| Variable | Qué es |
|---|---|
| `WHATSAPP_GATEWAY_URL` | URL pública del gateway, sin barra final |
| `WHATSAPP_GATEWAY_API_KEY` | `AUTHENTICATION_API_KEY` del gateway |
| `WHATSAPP_INSTANCE` | Nombre de la instancia (ej. `planeta`) |
| `WHATSAPP_WEBHOOK_SECRET` | Texto largo y aleatorio (24+ caracteres) que va en la URL del webhook |

Sin estas variables, la pantalla muestra "WhatsApp todavía no está configurado" al enviar, y el
webhook rechaza todo.

## Puesta en marcha

1. Desplegar Evolution API (con su Postgres y Redis) en el servidor elegido, con `AUTHENTICATION_API_KEY`.
2. Crear la instancia y vincular el celular desde `/whatsapp/conexion` (administrador).
3. En el Manager del gateway, configurar el webhook en
   `https://sistema.planetaanimal.com.ar/api/whatsapp/webhook/<WHATSAPP_WEBHOOK_SECRET>`
   con el evento de mensajes nuevos (`MESSAGES_UPSERT`).
4. Cargar las cuatro variables en Vercel y volver a desplegar.
5. Probar: escribir al número desde otro teléfono; el chat debe aparecer en `/whatsapp`.
6. Recién después, activar las respuestas automáticas desde `/whatsapp/automaticos`.

## Mantenimiento

- **Rotar el secreto del webhook:** cambiar `WHATSAPP_WEBHOOK_SECRET` en Vercel y la URL en el Manager del gateway. El secreto viaja en la URL y puede quedar en los registros de Vercel.
- **Cambiar de número:** cerrar la sesión desde el Manager del gateway y volver a escanear en `/whatsapp/conexion`.
- **Si el aviso rojo de desconexión no se va:** revisar que el celular tenga internet y que el gateway esté corriendo.
- **Apagar todo de golpe:** desactivar el interruptor en `/whatsapp/automaticos` (las respuestas automáticas), o quitar `WHATSAPP_GATEWAY_URL` de Vercel (deja de enviar).

## Límites de la v1

Solo texto (los adjuntos aparecen como "📷 Imagen", "🎤 Audio", etc.), un solo número, sin difusiones
masivas y sin estados "entregado/leído" (solo enviado, enviando o con error).

## Riesgo

Vincular por QR no es la API oficial de Meta: el número puede ser bloqueado. Por eso las respuestas
automáticas solo salen a quien escribió primero, una vez por conversación cada 24 horas por regla,
con una pausa de 2 a 6 segundos y nunca a proveedores. No hay envíos masivos.
