# HU3 — Notificaciones push en Android e iPhone · Especificación

Historia: `hu.md` · Fecha: 2026-11-08 · Estado: aprobada

## Objetivo

Que el equipo de una empresa reciba en el móvil (Android o iPhone) y en el
escritorio los avisos de Maya aunque tenga la app cerrada, con control sobre
qué avisos recibe y en qué dispositivos, sin necesitar cuenta de Apple
Developer.

## Usuarios

- Vendedor / agente: avisos de sus chats y leads en el móvil.
- Administrador: lo mismo, más avisos de formularios y recuperación.

## Alcance

- Incluye: app Android (FCM), web instalada en Android y en iPhone (Web Push,
  iOS 16.4+), escritorio (Web Push); pantalla de Configuración unificada;
  lista de dispositivos; preferencias por tipo de aviso; agrupación por chat;
  insignia de no leídos; prueba; guía para el usuario.
- **Fuera de alcance:** app nativa de iPhone (`frontend/ios`) y App Store
  (requieren cuenta de pago de Apple); publicación en Play Store; avisos por
  SMS/correo; push a clientes finales.

## Estado de partida (resumen)

Ya existen los dos canales: Web Push (`backend/src/push`, `frontend/public/sw.js`,
`frontend/src/app/shared/push.service.ts`, campana `push-center.ts`) y FCM
(`backend/src/notifications`, `frontend/src/app/core/push.service.ts`, tarjeta en
Configuración solo en la app nativa). Los servicios de conversaciones,
formularios, leads, recordatorios y recuperación ya llaman a los dos. Faltan:
preferencias, lista de dispositivos, Configuración para web, filtro por usuario
activo en Web Push, agrupación con contador, insignia, aviso de derivación por
FCM, que "Desactivar" persista, baja de token FCM limitada a su dueño, guía de
iOS < 16.4 y de permiso negado por plataforma, y la documentación.

## Requisitos (EARS)

Funcionales:
- **R1** — Cuando el usuario abre Configuración → Notificaciones, el sistema debe
  mostrar el estado del dispositivo actual (app Android o navegador) y permitir
  activarlo o desactivarlo; el permiso del sistema solo se pide al pulsar.
- **R2** — Cuando el usuario está en iPhone/iPad en Safari sin instalar, el
  sistema debe mostrar los pasos para añadir Maya a la pantalla de inicio; si
  iOS es < 16.4, debe indicar que actualice iOS.
- **R3** — Si el permiso está denegado, entonces el sistema debe explicar cómo
  reactivarlo según la plataforma (app Android, Android navegador, iPhone,
  escritorio).
- **R4** — Si el servidor no tiene configurado el canal de este dispositivo
  (VAPID o Firebase), entonces el sistema debe decirlo y seguir funcionando.
- **R5** — El sistema debe listar los dispositivos activos del usuario
  (tipo, descripción, alta, último uso, cuál es el actual) y permitir dar de
  baja cualquiera de ellos.
- **R6** — Cuando ocurre un mensaje entrante, derivación a humano, registro de
  formulario, lead nuevo sin asignar, lead asignado, recordatorio de lead o aviso de recuperación, el
  sistema debe enviar push por los dos canales a los destinatarios.
- **R7** — El sistema debe enviar cada aviso solo a usuarios activos de la
  empresa cuyo rol tenga el módulo del aviso; un chat con dueño solo avisa al
  dueño.
- **R8** — Cuando el usuario ya tiene abierta en primer plano la conversación
  del aviso, el sistema no debe mostrar una notificación audible (web:
  silenciosa y se retira; app: sin toast).
- **R9** — Cuando llegan varios mensajes de un mismo chat sin leer, el sistema
  debe mostrar una sola notificación que se reemplaza, indicando cuántos hay.
- **R10** — La notificación debe mostrar el contacto y canal en el título y un
  extracto ≤ 100 caracteres del mensaje (o el tipo de adjunto).
- **R11** — Cuando el usuario toca la notificación, el sistema debe abrir la
  ruta del aviso (chat, lead, formularios, recuperación).
- **R12** — El sistema debe mostrar en el ícono de la app el total de mensajes
  sin leer de la empresa y limpiarlo al llegar a cero.
- **R13** — Si el proveedor rechaza una suscripción o token como caducado,
  entonces el sistema debe borrarlo en ese envío.
- **R14** — Cuando el usuario cierra sesión, el sistema debe dar de baja el
  dispositivo; cuando "Desactiva" en un dispositivo, este no debe reactivarse
  solo al volver a abrir la app.
- **R15** — Si falla el envío de push, entonces la operación que lo originó no
  debe fallar; el error se registra en el log.
- **R16** — El usuario debe poder elegir qué tipos de aviso recibe (chats,
  formularios, leads, recuperación) y silenciarlos todos.
- **R17** — El sistema debe ofrecer "Enviar prueba" a todos los dispositivos del
  usuario (los dos canales).

No funcionales:
- **R18** (seguridad) — Toda alta, baja, listado y preferencia actúa solo sobre
  el usuario del JWT; no se puede dar de baja el dispositivo de otro usuario.
  La lista de dispositivos no expone endpoints ni tokens.
- **R19** (privacidad) — Los logs de push no incluyen el contenido del mensaje ni
  datos del contacto.
- **R20** (accesibilidad) — Controles con etiqueta accesible, foco visible,
  interruptores operables por teclado.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | Dado un usuario en Configuración, cuando abre Notificaciones en navegador o en la app, entonces ve el estado del dispositivo y el botón Activar/Desactivar; el permiso solo se pide al pulsar | unitaria frontend (settings) |
| C2 | R2 | Dado Safari en iPhone sin instalar, entonces ve los pasos de instalación; con iOS 16.3 ve "actualiza iOS" | unitaria frontend |
| C3 | R3 | Dado permiso denegado, entonces ve las instrucciones de su plataforma | unitaria frontend |
| C4 | R4 | Dado servidor sin VAPID (web) o sin Firebase (app), entonces ve el aviso de servidor no configurado | unitaria frontend + backend `status` |
| C5 | R5, R18 | Dado un usuario con 2 dispositivos (web y Android), cuando pide la lista, entonces recibe ambos sin endpoint/token, marca el actual y puede borrar uno; no puede borrar el de otro usuario | unitarias backend (controller/servicio) + frontend |
| C6 | R6 | Cuando ocurre cada evento, entonces se llama a los dos canales (incluida la derivación por FCM) | unitarias backend existentes + nueva de derivación |
| C7 | R7 | Dado un usuario inactivo, otro sin el módulo y otro con él, entonces solo el último recibe; chat con dueño → solo el dueño | unitaria backend (audiencia) |
| C8 | R8 | Dado la conversación abierta y visible, el SW muestra silenciosa y retira; la app no muestra toast | revisión de `sw.js` + unitaria frontend (native push) |
| C9 | R9 | Dado un chat con 3 sin leer, la notificación dice "3 mensajes nuevos" y usa la misma etiqueta del chat | unitaria backend |
| C10 | R10 | Dado un texto de 300 caracteres, el extracto tiene ≤ 100 y termina en "…" | unitaria backend |
| C11 | R11 | Cada aviso lleva `url` (web) y `data.route` (app) a una ruta existente | unitarias backend + revisión de rutas |
| C12 | R12 | El push de chat lleva `badge` = total sin leer; el SW llama `setAppBadge`; la app abierta sincroniza y limpia con 0; FCM lleva `notificationCount` | unitaria backend + frontend (realtime) |
| C13 | R13 | 404/410 en Web Push y token no registrado en FCM borran el registro | unitarias backend existentes |
| C14 | R14 | Al cerrar sesión se dan de baja ambos canales; tras "Desactivar", `init()` no vuelve a suscribir | unitaria frontend |
| C15 | R15 | Si el proveedor o la base fallan, `notify` no lanza | unitaria backend |
| C16 | R16 | Dado un usuario con "leads" apagado, no recibe avisos de leads; con "silenciar todo", ninguno salvo la prueba | unitarias backend + frontend |
| C17 | R17 | "Enviar prueba" llama a `POST /push/test`, que envía por ambos canales | unitaria backend |
| C18 | R18 | `DELETE /devices/:token` solo borra tokens del usuario del JWT | unitaria backend |
| C19 | R19 | Los logs de push no contienen título/cuerpo | revisión de código |
| C20 | R20 | Interruptores con `role="switch"`/`aria-checked` o checkbox con label | unitaria frontend |
| C21 | — | `docs/notificaciones-push.md` con VAPID, Firebase (Android), Coolify, APK, instalación de la PWA en iPhone y Android; enlazado desde `docs/android-app.md` | revisión |
| C22 | — | Prueba real en un Android con APK y un iPhone iOS 16.4+ con la PWA **[usuario]** | manual |
| C23 | — | Claves VAPID y Firebase cargadas en Coolify **[usuario]** | manual |

## Supuestos y decisiones por defecto

- "Configuración → Notificaciones" es un mismo panel que se muestra en dos
  sitios: la campana de la cabecera (la ve todo usuario, también los
  vendedores sin el módulo `settings`) y la página Configuración.

- La insignia usa el mismo total que el menú (`/conversations/unread-count`:
  mensajes sin leer de la empresa), no "chats sin leer por usuario".
- Preferencias en el propio `User` (`pushPrefs`), todas activas por defecto.
  La prueba ignora las preferencias.
- Categorías: `chats` (inbox, derivaciones), `forms`, `leads`, `recovery`.
- En web, "silenciar si se está viendo" muestra la notificación silenciosa y la
  cierra al instante: el navegador (y iOS) exigen mostrar algo por cada push.
- El canal Android se renombra a "Mensajes" (mismo id `maya_default`, sonido
  por defecto); Android permite actualizar el nombre de un canal existente.
- Un solo destino de recepción por usuario: la resolución de destinatarios se
  centraliza en un servicio de audiencia común a los dos canales.

## Preguntas abiertas

- Ninguna.
