# HU23 — Conversaciones en tiempo real · Especificación

Historia: `hu.md` · Fecha: 2026-11-20 · Estado: aprobada

## Objetivo

La bandeja y el chat abierto deben quedar al día sin recargar la página,
también después de que el socket se corte (red móvil, app en segundo plano,
deploy del backend).

## Diagnóstico

- El backend ya emite `message:new`, `message:updated` y
  `conversation:updated` en todos los caminos que llegan a Conversaciones:
  entrantes (webhooks), operador, agente IA, API de integraciones, notas del
  sistema, reintentos (HU7) y cambios de estado de Meta. Las campañas masivas
  no crean mensajes en Conversaciones (fuera de alcance).
- El websocket de producción funciona (`wss://api.mayacrm.site`, comprobado).
- Fallo real: lo que se emite mientras el socket está caído se pierde. Al
  reconectar o al volver a la app nadie vuelve a pedir datos: la lista solo se
  relee cada 15 s *mientras* no hay conexión y el chat abierto nunca. Al volver
  de segundo plano solo se relee el contador.

## Requisitos

- R1 — El servicio de tiempo real avisa (`resync$`) cuando hay que recuperar
  datos: al reconectar el socket (no en la primera conexión), al volver la
  pestaña/app a primer plano y al volver la red (`online`).
- R2 — Ante `resync$` la bandeja relee la lista (en silencio) y sincroniza el
  chat abierto.
- R3 — Sincronizar el chat abierto **mezcla** por `_id` los últimos mensajes con
  los que ya hay: no duplica, conserva los mensajes antiguos ya cargados y las
  burbujas provisionales (envíos en curso), actualiza el estado de los que
  cambiaron y mantiene el orden por fecha.
- R4 — Mientras el socket está caído, la red de seguridad periódica sincroniza
  también el chat abierto, no solo la lista.
- R5 — Al reconectar se relee también el contador de no leídos.
- R6 — Las relecturas automáticas no muestran la barra de carga ni el
  indicador de "Cargando".

## Criterios de aceptación

- C1 — Un `connect` tras un `disconnect` emite `resync$`; la primera conexión no.
- C2 — `visibilitychange` a visible y `online` emiten `resync$` y releen el contador.
- C3 — Con `resync$` la bandeja pide la lista y los mensajes del chat abierto.
- C4 — La sincronización añade el mensaje nuevo, actualiza el estado de uno
  existente, no duplica y conserva los antiguos y los provisionales.
- C5 — Sin conexión, la red de seguridad relee lista y chat abierto.
- C6 — `npm run verify` en verde.
- C7 — [usuario] En producción: cortar la red del móvil o dejar la app en
  segundo plano, recibir un mensaje y comprobar que aparece al volver.
