# HU6 — Llamadas de WhatsApp (módulo Llamadas) · Especificación

Historia: `backlog/hu6.md` · Fecha: 2026-11-09 · Estado: aprobada

## Objetivo

Que los vendedores y agentes de una empresa reciban y hagan llamadas de voz de
WhatsApp desde Maya CRM, sin usar su teléfono personal, en un módulo propio de
Llamadas. Cada llamada queda registrada en la ficha del cliente y en su chat.

## Usuarios

- **Usuario con permiso `calls`** (vendedor, agente o gerente): atiende llamadas,
  llama a clientes con permiso y consulta el historial.
- **Administrador de la empresa**: activa las llamadas en cada número y
  configura el horario, el botón de llamada, el tiempo de espera y la respuesta
  automática a las llamadas perdidas.
- **Cliente final**: llama al número de WhatsApp de la empresa o recibe su
  llamada después de dar permiso.

## Alcance

Incluye:
- módulo `/llamadas` con permiso `calls`;
- llamadas entrantes y salientes con audio WebRTC en el navegador y en la app
  Android (WebView);
- permiso de llamada (solicitar y ver su estado);
- configuración de llamadas por cuenta de WhatsApp;
- registro de cada llamada en la ficha del cliente y en su chat;
- contadores en el panel.

Incluye también dos correcciones de seguridad que las llamadas necesitan:
- **Firma de los webhooks.** Hoy ningún webhook de WhatsApp valida la firma de
  Meta (`X-Hub-Signature-256`).
- **Socket con sesión.** El socket en tiempo real acepta a cualquiera que envíe
  un `tenantId`. Las llamadas viajarían por él, así que pasa a exigir el JWT.

**Fuera de alcance:**
- videollamadas, grabación, transcripción y buzón de voz;
- el agente IA contestando por voz;
- SIP, PSTN y proveedores distintos de Cloud API;
- transferir una llamada en curso;
- reparto por cola;
- la pantalla nativa de llamada (CallKit o ConnectionService);
- servidor TURN propio.

## Requisitos (EARS)

Funcionales:
- **R1** — Cuando Meta envíe un webhook `calls` con `event: connect` y
  `direction: USER_INITIATED`, el sistema debe:
  - registrar la llamada como `ringing`;
  - avisar por socket, en menos de 3 s, solo a los usuarios conectados de esa
    empresa cuyo rol tenga `calls`;
  - enviar una push (web y nativa) a esos mismos usuarios.
- **R2** — Cuando un usuario acepte, el sistema debe:
  - reservar la llamada de forma atómica para ese usuario;
  - entregarle la oferta SDP;
  - enviar a Meta `pre_accept` y luego `accept` con la respuesta SDP del
    navegador;
  - pasar la llamada a `active`.
- **R3** — Cuando la llamada ya esté reservada o terminada, el sistema debe
  responder a un segundo intento de aceptar con 409 "Esta llamada ya fue
  atendida" (o "ya terminó"). Además debe avisar a los demás para que retiren el
  aviso.
- **R4** — Cuando un usuario rechace la llamada, el sistema debe enviar `reject`
  a Meta, marcarla `rejected` y retirar el aviso a todos.
- **R5** — Cuando pase el tiempo de espera de la cuenta sin que nadie acepte (por
  defecto 30 s, entre 15 y 60), o llegue `terminate` mientras suena, el sistema
  debe:
  - marcarla `missed`;
  - retirar el aviso;
  - si la cuenta tiene activada la respuesta automática, enviar al cliente por
    WhatsApp el mensaje configurado (la llamada entrante abre la ventana de
    24 h).
- **R6** — Cuando llamen desde un contacto bloqueado (HU4), el sistema debe
  enviar `reject` a Meta y guardarla como `blocked`, sin avisar a nadie ni
  enviar push.
- **R7** — Cuando llegue `terminate` de una llamada `active`, o el usuario
  cuelgue (`terminate` a Meta), el sistema debe:
  - marcarla `completed` con `endedAt` y la duración (la de Meta si la trae);
  - avisar al usuario que la atendía para que cierre el audio.
- **R8** — Cuando el usuario pida llamar a un contacto, el sistema debe
  consultar a Meta el permiso de llamada
  (`GET /{phone-number-id}/call_permissions`) y mostrar uno de estos estados:
  - sin permiso;
  - solicitud pendiente;
  - concedido hasta una fecha, o permanente;
  - rechazado;
  - vencido.

  También debe indicar si se puede solicitar permiso y si se puede llamar.
- **R9** — Cuando el usuario solicite permiso, el sistema debe:
  - enviar el mensaje interactivo `call_permission_request`;
  - guardarlo como pendiente;
  - cuando llegue `call_permission_reply`, guardar la respuesta (aceptado con su
    vencimiento, o rechazado).
- **R10** — Cuando el usuario llame a un contacto con permiso, el sistema debe:
  - enviar a Meta `connect` con la oferta SDP del navegador;
  - registrar la llamada `outbound` como `ringing`;
  - cuando llegue el `connect` con la respuesta SDP, entregársela solo a ese
    usuario;
  - con los estados `RINGING`, `ACCEPTED` y `REJECTED`, pasarla a `ringing`,
    `active` o `rejected`.
- **R11** — El historial debe:
  - listar las llamadas de la empresa (entrantes y salientes; `completed`,
    `missed`, `rejected`, `blocked` y `failed`), con fecha, duración, cliente,
    cuenta y usuario;
  - filtrar por estado, dirección, rango de fechas, usuario y cuenta, con
    paginación;
  - desde cada fila, permitir devolver la llamada, abrir la ficha del cliente o
    ir a su chat.
- **R12** — Cuando una llamada termine en cualquier estado, el sistema debe:
  - añadir una actividad `call` en la ficha del cliente (creándolo si no
    existe);
  - añadir una nota de sistema en su chat de WhatsApp (creándolo si no existe).

  Ejemplo: "Llamada entrante · 3 min 12 s · atendió Ana".
- **R13** — El administrador debe poder ver y cambiar, en cada cuenta de
  WhatsApp, la configuración de llamadas en Meta:
  - activadas o no;
  - visibilidad del botón de llamada;
  - devolución de llamada;
  - horario semanal con zona horaria.

  La plataforma muestra lo que devuelve Meta (`GET /settings`). Si Meta rechaza
  el cambio, se muestra su motivo.

  Los ajustes locales (tiempo de espera, respuesta automática y su texto) se
  guardan en la cuenta.
- **R14** — El panel debe mostrar llamadas, perdidas y duración media del
  período, a quien tenga `calls`.
- **R15** — El botón "Llamar" debe estar en el módulo Llamadas, en la ficha del
  cliente y en el chat de WhatsApp. Este último solo con una cuenta Cloud API.
- **R16** — Si el usuario niega el micrófono o el navegador no lo soporta, el
  sistema debe explicar cómo concederlo y no aceptar la llamada. El micrófono
  se pide **antes** de reservar, así que la llamada sigue sonando para los
  demás; si algo falla después de reservar, la reserva se libera.

No funcionales:
- **R17 (seguridad, webhooks)** — Validar `X-Hub-Signature-256` (HMAC-SHA256 del
  cuerpo crudo):
  - en la URL de nivel de app, con `FACEBOOK_APP_SECRET`;
  - en la URL por cuenta, con el `waAppSecret` de la cuenta si lo tiene.

  Una firma inválida descarta el evento. Sin secreto configurado, los mensajes
  siguen como hoy (con aviso en el log), pero los eventos de llamadas se
  descartan.
- **R18 (seguridad, socket)** — El socket exige un JWT válido y no revocado. Une
  al cliente a las salas:
  - `tenant:<tenantId>`, tomado del token, nunca de la query;
  - `user:<userId>`;
  - `calls:<tenantId>`, si su rol tiene `calls`.

  Sin token válido, se desconecta.
- **R19 (permisos)** — Todas las rutas `/calls` usan `JwtAuthGuard` +
  `ModuleGuard('calls')`, y la configuración de Meta, además, `assertRole`
  de administrador. Cada consulta filtra por el `tenantId` del token.
- **R20 (privacidad)** — En los logs:
  - los teléfonos van enmascarados (`+51***678`);
  - nunca se escribe el SDP;
  - nunca se escribe el token.

  El SDP de oferta solo se guarda mientras la llamada suena y se borra al
  aceptarla o terminarla.
- **R21 (idempotencia)** — Los webhooks repetidos (mismo `call id` y evento) no
  duplican llamadas, avisos ni registros.
- **R22 (accesibilidad)**:
  - el aviso de llamada es `role="alertdialog"`, con foco en "Aceptar";
  - Escape no rechaza la llamada (sería irreversible);
  - el panel de llamada tiene botones con `aria-label` y `aria-pressed` en
    silenciar;
  - todo se puede usar con teclado y en móvil.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1, R18 | Dado un usuario con `calls` conectado al socket, cuando llega un webhook `connect` entrante firmado, entonces recibe `call:incoming` (sin SDP) y se envía una push con `moduleKey: 'calls'`. | e2e de API (socket.io-client real) + unitaria |
| C2 | R2, R7 | Al aceptar, las dos partes se oyen. Al colgar cualquiera de las dos, la llamada se cierra en la plataforma y en el teléfono. **[usuario: prueba real con un número habilitado]** | manual; la señalización la cubren unitarias y e2e |
| C3 | R5 | Dado un entrante sin respuesta, al vencer el tiempo de espera (o llegar `terminate`) queda `missed` con su hora, y si está activado se envía el mensaje automático. | unitaria (reloj controlado) + e2e de API |
| C4 | R2, R3 | Dados dos usuarios con `calls`, cuando uno acepta, el otro recibe `call:taken` y su `claim` responde 409. | e2e de API + unitaria del aviso |
| C5 | R1 | Con la plataforma cerrada llega una push de llamada entrante (Android nativa y web push/PWA). | unitaria (se llama a los dos servicios de push); entrega real **[usuario]** |
| C6 | R6 | Un entrante de un contacto bloqueado envía `reject`, queda `blocked` y no emite aviso ni push. | e2e de API |
| C7 | R8–R10 | Sin permiso, "Llamar" ofrece solicitarlo y muestra el estado. Con permiso vigente, `POST /calls/outbound` envía `connect` y la respuesta SDP llega solo a quien llama. | unitarias (servicio + diálogo) + e2e de API |
| C8 | R11, R19 | El historial lista y filtra por estado, dirección, fechas, usuario y cuenta, y otra empresa no ve nada (404/lista vacía). | e2e de API + unitaria de la página + e2e de navegador |
| C9 | R12 | Toda llamada terminada crea una actividad `call` en la ficha y una nota en el chat de WhatsApp, una sola vez aunque el webhook se repita. | e2e de API |
| C10 | R13 | Guardar la configuración envía `POST /settings` con la forma de Meta y la pantalla muestra lo que devuelve `GET /settings`. Si Meta responde error, se muestra su mensaje. La activación real en Meta es **[usuario]**. | unitarias (servicio + pantalla) |
| C11 | R18, R19 | Un rol sin `calls` no ve el menú, recibe 403 en `/calls/*` y no entra en la sala `calls:`. | e2e de API + unitaria del shell |
| C12 | R16 | Si `getUserMedia` falla, se muestra cómo conceder el micrófono, no se reserva la llamada (sigue sonando) y no se envía `accept`; si falla tras reservar, se libera. | unitaria del servicio de llamadas + e2e de navegador |
| C13 | R17, R20, R21 | Un webhook con firma inválida o sin ella (si hay secreto) se descarta. Los logs no contienen teléfonos completos ni SDP. Un webhook repetido no duplica nada. | unitarias + e2e de API |
| C14 | todos | Hay pruebas: unitarias de backend (servicio, máquina de estados, webhook, firma, gateway) y de frontend (aviso, panel, historial, botón Llamar, configuración); e2e de API con webhooks simulados; e2e de navegador del historial y del aviso con WebRTC simulado. | revisión de las pruebas |
| C15 | todos | `npm run verify` pasa completo. | salida del comando |
| C16 | R14 | El panel muestra llamadas, perdidas y duración media a quien tiene `calls` (KPIs `calls`, `callsMissed`, `callAvgDuration` de `/dashboard/analytics`, con serie y comparación). | unitaria backend + frontend |

## Supuestos y decisiones por defecto

- **Audio directo:** va del navegador a Meta. Meta ofrece `ice-lite` con
  candidatos públicos, así que no hace falta servidor de medios ni TURN propio.
  Se usa un STUN público; un TURN queda configurable por entorno, sin valor por
  defecto.
- **SDP completo:** la respuesta y la oferta SDP del navegador se envían
  completas, después de esperar a `iceGatheringState === 'complete'` (máximo
  3 s). La API de Meta no admite trickle ICE.
- **Rechazar:** rechaza la llamada para todos, como un teléfono. No hay
  "ignorar solo para mí".
- **Fuera de horario:** lo gestiona Meta con `call_hours`, que no deja llamar.
  Esas llamadas no llegan al webhook, así que no pueden quedar como perdidas.
  Se documenta.
- **Tiempo de espera:** se aplica con un temporizador por llamada, más un
  barrido cada 15 s que cubre reinicios y varias instancias del backend.
- **Versión de Graph:** las llamadas a la Calling API usan la versión de
  `META_CALLING_GRAPH_VERSION` (por defecto `v24.0`), porque la general
  (`v21.0`) es anterior a la Calling API. El resto del sistema no cambia.
- **Contacto:** se usa `from` (teléfono). Si solo llega el `from_user_id`
  (BSUID), se usa ese, como en los mensajes.
- **Permiso de llamada:** Meta es la fuente de verdad. Localmente solo se
  guarda la última solicitud enviada y la última respuesta recibida, para
  mostrar "pendiente" y "rechazado", que Meta no devuelve.
- **Firma de la URL por cuenta:** las cuentas conectadas con la app propia de
  la empresa (URL por cuenta) pueden guardar su `waAppSecret`. Sin él, sus
  eventos de llamadas se descartan y los mensajes siguen igual.
- **App Android:** se añaden `RECORD_AUDIO` y `MODIFY_AUDIO_SETTINGS` al
  manifiesto. El WebView de Capacitor concede el micrófono con el permiso del
  sistema.
- **Un solo canal:** se reutiliza el socket `/conversations`, ahora
  autenticado, en vez de abrir otro.

## Preguntas abiertas

- Ninguna bloqueante. Lo que depende de Meta (número habilitado, límite de
  mensajería ≥ 2000, método de pago para salientes, suscribir el campo `calls`
  en el webhook) va en `docs/llamadas-whatsapp.md` para el usuario.
