# HU13 — API de envío de mensajes por las cuentas conectadas · Especificación

Historia: `backlog/hu13.md` · Fecha: 2026-11-14 · Estado: aprobada

## Objetivo

Que una empresa envíe mensajes por una de sus cuentas conectadas (WhatsApp,
Instagram, Messenger) desde su propio sistema (p. ej. el servidor de su web),
con una clave de API ligada a esa cuenta y solo desde los dominios que la
empresa autorice. Lo enviado queda en la bandeja como cualquier otro mensaje.

## Usuarios

- Administrador de la empresa (o rol con el módulo "Integraciones"): crea,
  edita, revoca y regenera accesos; copia el endpoint, la clave y los ejemplos.
- Desarrollador de la web de la empresa: llama al endpoint desde su servidor.
- Equipo de la bandeja: ve los mensajes enviados por API en la conversación.

## Alcance

- Incluye: módulo "Integraciones" (permiso `integrations`, menú Gestión);
  accesos ligados a una cuenta de WhatsApp (Cloud API), Instagram o Messenger;
  clave secreta mostrada una vez (se guarda su hash); dominios autorizados
  obligatorios y lista opcional de IPs; límites por minuto y por día;
  `POST /public/v1/messages` (texto, archivo por URL, plantilla de WhatsApp);
  `GET /public/v1/messages/:id`; `Idempotency-Key`; ventana de 24 h; "No
  contactar" y bloqueos; mensaje visible en la bandeja con el nombre del acceso;
  documentación y ejemplos en la pantalla.
- **Fuera de alcance:** SMS y correo (no tienen conversación en la bandeja o
  usan otra configuración: siguiente historia); uso desde el navegador del
  visitante (CORS público); webhook de salida con estados y respuestas
  (siguiente historia); verificación de propiedad del dominio por DNS;
  aprobación de dominios por el superadministrador.

## Requisitos (EARS)

Funcionales:
- **R1** — Cuando un usuario con el módulo `integrations` crea un acceso
  eligiendo una cuenta conectada de su empresa, un nombre y al menos un dominio,
  el sistema debe guardar el acceso y devolver una sola vez la clave secreta, la
  URL del endpoint y ejemplos (cURL y `fetch`).
- **R2** — El sistema debe guardar solo el hash SHA-256 de la clave y un prefijo
  visible; la clave completa no se puede volver a consultar.
- **R3** — Cuando llega `POST /public/v1/messages` con `Authorization: Bearer
  <clave>` válida, activa, de un acceso cuyo dominio de `Origin` (o `Referer`)
  está autorizado, el sistema debe enviar el mensaje por la cuenta del acceso,
  guardarlo en la conversación del contacto (creándola si no existe) y responder
  `201` con `{ id, status, conversationId, channel, to }`.
- **R4** — Si la clave no existe o está revocada, el sistema debe responder
  `401`; si el `Origin`/`Referer` falta o su dominio no está autorizado, o la IP
  no está en la lista (cuando hay lista), `403`.
- **R5** — Si la cuenta del acceso ya no existe, no es de la empresa o está
  inactiva, el sistema debe responder `409` sin enviar nada.
- **R6** — En WhatsApp, si el contacto no escribió en las últimas 24 h y el
  mensaje no es una plantilla, el sistema debe responder `422` explicando que
  hace falta una plantilla aprobada. En Instagram y Messenger, si no hay
  conversación con el contacto o su último mensaje tiene más de 24 h, `422`.
- **R7** — Si se pide una plantilla, el sistema debe exigir que exista para esa
  cuenta, esté aprobada y reciba el número de variables de su cuerpo; si no,
  `422`.
- **R8** — Si el destinatario está bloqueado o (WhatsApp) en "No contactar", el
  sistema debe responder `422` sin enviar.
- **R9** — Si se supera el límite por minuto o por día del acceso, el sistema
  debe responder `429` con `Retry-After`.
- **R10** — Cuando la petición trae `Idempotency-Key` ya usada por el mismo
  acceso, el sistema debe devolver el mensaje existente sin volver a enviarlo.
- **R11** — Cuando llega `GET /public/v1/messages/:id` con una clave válida, el
  sistema debe devolver el estado (pendiente, enviado, entregado, leído,
  fallido) y el error si lo hay, solo de mensajes de ese mismo acceso (`404` si
  no).
- **R12** — La bandeja debe mostrar el mensaje enviado por API con la etiqueta
  "API · <nombre del acceso>".
- **R13** — El usuario debe poder listar accesos (nombre, cuenta, prefijo,
  dominios, creado, último uso, envíos, estado), editar nombre, dominios, IPs y
  límites, revocar (deja de funcionar al instante) y regenerar la clave.
- **R14** — Si el cuerpo es inválido (sin `to`, sin contenido, URL no `https`,
  tipo de archivo desconocido), `400` con el motivo.

No funcionales:
- **R15 (seguridad/aislamiento)** — Un acceso solo envía por su cuenta y solo
  ve sus mensajes; las rutas de administración exigen JWT, el módulo
  `integrations` y filtran por tenant.
- **R16 (privacidad)** — Los logs no guardan la clave ni el contenido; el
  destinatario se enmascara.
- **R17 (rendimiento)** — La validación de la clave es una consulta por índice
  único (`keyHash`); los contadores de límite son una operación atómica.
- **R18 (UX)** — Pantalla con estados vacío/cargando/error, toasts,
  `ConfirmService` para revocar/regenerar y `app-form-page` para el formulario.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1, R2 | Dado un admin, cuando crea un acceso con una cuenta de WhatsApp y un dominio, entonces recibe una clave `mk_…` una vez y en BD solo hay hash y prefijo | unitaria del servicio + e2e de API |
| C2 | R1, R15 | Dado una cuenta de otra empresa, cuando se intenta crear un acceso con ella, entonces `404`; sin dominios, `400` | unitaria |
| C3 | R3, R12 | Dado un acceso válido y `Origin` autorizado, cuando se envía un texto a un número con chat abierto en las últimas 24 h, entonces `201`, el mensaje queda en la conversación con `apiAccessId` y se entrega por la cuenta | e2e de API (proveedor simulado) + unitaria |
| C4 | R4 | Clave inexistente o revocada → `401`; sin `Origin`/`Referer` o dominio ajeno → `403`; subdominio con `*.dominio.com` → aceptado; IP fuera de la lista → `403` | unitaria del guard + e2e de API |
| C5 | R5 | Cuenta borrada o inactiva → `409` y nada enviado | unitaria |
| C6 | R6 | WhatsApp sin entrante en 24 h y texto → `422`; con plantilla → `201`; Instagram sin conversación → `422` | unitaria |
| C7 | R7 | Plantilla inexistente, no aprobada o con variables de menos → `422`; correcta → envía con sus variables y guarda el texto resuelto | unitaria |
| C8 | R8 | Contacto bloqueado o en "No contactar" → `422`, sin envío | unitaria |
| C9 | R9 | Con límite 2/min, la tercera petición del minuto → `429` con `Retry-After` | unitaria + e2e de API |
| C10 | R10 | Dos `POST` con la misma `Idempotency-Key` → mismo `id`, un solo envío | unitaria + e2e de API |
| C11 | R11 | `GET` de un mensaje propio → estado; de otro acceso → `404` | unitaria + e2e de API |
| C12 | R13, R18 | En la pantalla se crea un acceso, se ve la clave una vez, se copia; se revoca con confirmación y pasa a "Revocado" | e2e de navegador |
| C13 | R13 | Regenerar invalida la clave anterior (`401`) y la nueva funciona | unitaria |
| C14 | R14 | Sin `to`, sin texto ni archivo ni plantilla, o `mediaUrl` `http:` → `400` | unitaria del DTO/servicio |
| C15 | R16 | Los logs del envío no contienen la clave ni el texto | revisión del código |
| C16 | R12 | La burbuja muestra "API · <nombre>" | unitaria/revisión de la bandeja |
| C17 | — | Prueba real: crear un acceso para la cuenta de WhatsApp, enviar con cURL desde un servidor con `Origin` autorizado y verlo en la bandeja **[usuario]** | manual |

## Supuestos y decisiones por defecto

- **Dominio autorizado:** se comprueba la cabecera `Origin` (o, si falta,
  `Referer`) contra la lista. Desde un servidor esa cabecera la pone quien
  llama, así que es un segundo control y no sustituye a la clave; para un
  control fuerte está la lista opcional de IPs. Se documenta así en la pantalla.
  `*.dominio.com` acepta subdominios; `dominio.com` solo ese host (y `www.`).
- Quien autoriza los dominios es el administrador de la empresa al crear o
  editar el acceso (no hay aprobación de la plataforma).
- Clave: `mk_` + 32 bytes aleatorios en base64url. Prefijo visible: los 10
  primeros caracteres.
- Límites por defecto: 60/min y 2000/día (editables: 1–600/min, 1–100 000/día).
- El permiso `integrations` es fijo para el administrador (como `users` y
  `settings`) para que las empresas existentes lo vean sin migración; los
  demás roles lo reciben desde la matriz de permisos.
- El mensaje se guarda con `author: 'human'`, `apiAccessId` y `apiAccessName`;
  no cambia quién atiende el chat ni pausa al agente IA.
- Destinatario: en WhatsApp, número internacional (se normaliza a dígitos); en
  Instagram/Messenger, el id del contacto en ese canal (`contact` de la
  conversación).
- Los estados (entregado, leído) llegan por los webhooks que ya existen gracias
  al `externalId`; el reintento automático de HU7 aplica igual que a la bandeja.

## Preguntas abiertas

- Ninguna (el usuario confirmó: uso desde servidor y con dominio autorizado).
