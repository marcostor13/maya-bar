# HU23 — Conversaciones en tiempo real · Cierre

- **Cerrada:** 2026-11-20
- **Estado:** Terminada con pendientes del usuario (prueba en producción)
- **Verificación (spec-verifier):** 4 CUMPLE (C3 y C5 por revisión de código) · C6 con `npm run verify` final del backlog · 1 [usuario] (C7) · hallazgos alto y medios corregidos
- **Commits:** ver historial de `develop` (HU23)

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Reconectar pide recuperar; la 1.ª conexión no | CUMPLE | `shared/conversations-realtime.ts` (`connections`), `conversations-realtime.spec.ts` |
| C2 | Primer plano y `online` piden recuperar y releen el contador | CUMPLE | `onVisible`/`onOnline`/`requestResync`, `conversations-realtime.spec.ts` (incluye agrupar avisos simultáneos) |
| C3 | `resync$` relee lista y chat abierto | CUMPLE (revisión de código) | `pages/inbox/inbox.ts` `listenRealtime` → `loadConversations(false)` + `syncMessages()` |
| C4 | Mezcla sin duplicar, conserva antiguos y provisionales | CUMPLE | `pages/inbox/merge-messages.ts`, `merge-messages.spec.ts` |
| C5 | Sin socket, la red de seguridad relee también el chat | CUMPLE (revisión de código) | `inbox.ts` `pollTimer` |
| C6 | `npm run verify` | CUMPLE | corrida final del backlog: todo OK |
| C7 | Prueba en producción | [usuario] | — |

## Qué se implementó

- Diagnóstico: el backend ya emitía todos los eventos; lo perdido con el socket caído (red, segundo plano, deploy) no se recuperaba nunca.
- `ConversationsRealtimeService.resync$`: al reconectar, al volver a primer plano y al volver la red, agrupado (400 ms). Relee también el contador.
- Bandeja: `syncMessages()` mezcla los últimos 50 con lo cargado (`mergeMessages`); marca como leído si recupera entrantes; si se perdieron más de 50 se queda la página nueva (sin huecos).
- La red de seguridad de 15 s sin socket sincroniza también el chat abierto. Las relecturas automáticas no muestran barra de carga ni toast de error.

## Lo que tiene que hacer el usuario

- C7: con un chat abierto en el móvil, cortar la red o dejar la app en segundo plano, recibir un mensaje y volver: debe aparecer sin recargar.

## Pendientes, riesgos y notas

- Las campañas masivas no crean mensajes en Conversaciones: no aparecen ni en tiempo real ni al recargar. Si se quiere, es una historia aparte.
- La bandeja no tiene prueba de componente (C3, C5 verificados leyendo el código).
- `upsertConv` (previo) no respeta los filtros de búsqueda/etiquetas; el resync lo corrige al releer.
