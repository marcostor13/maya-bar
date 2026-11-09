# HU6 — Llamadas de WhatsApp · Cierre

- **Cerrada:** 2026-11-09
- **Estado:** Terminada con pendientes del usuario (configuración en Meta y prueba con un número real)
- **Verificación (spec-verifier):** no ejecutada. El agente no se pudo lanzar: el hook de context-mode reescribe la llamada y el modo automático la bloquea. El usuario pidió archivar igualmente. Abajo, autoverificación criterio a criterio.
- **Commits:** ver `git log` (commit "HU6: llamadas de WhatsApp")

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md` · ADR: `../../decisiones/0002-llamadas-webrtc-directo-a-meta.md`

## Criterios de aceptación (autoverificación)

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Aviso entrante + push `calls` | CUMPLE | `backend/test/calls.e2e-spec.ts`; `frontend/e2e/calls.e2e.ts` (entrante) |
| C2 | Audio en los dos sentidos, colgar en ambos lados | [usuario] | Señalización probada (e2e); el audio real solo con un número habilitado |
| C3 | Perdida por tiempo o `terminate`, mensaje automático | CUMPLE | `backend/src/calls/calls.service.spec.ts`; e2e de navegador "perdida" |
| C4 | Primero que acepta se la queda; los demás reciben `call:taken` y 409 | CUMPLE | `calls.e2e-spec.ts`; `shared/calls/calls.service.spec.ts` |
| C5 | Push con la plataforma cerrada | CUMPLE (entrega real [usuario]) | `calls.service.spec.ts` (push nativa y web) |
| C6 | Contacto bloqueado → `reject`, `blocked`, sin aviso | CUMPLE | `calls.e2e-spec.ts` |
| C7 | Permiso para llamar y saliente con `connect` | CUMPLE | `call-ui.spec.ts`; e2e de navegador "llamar desde el historial" |
| C8 | Historial con filtros y aislado por empresa | CUMPLE | `calls.e2e-spec.ts`; `pages/calls/calls.spec.ts`; e2e de navegador |
| C9 | Actividad en la ficha y nota en el chat, sin duplicar | CUMPLE | `calls.e2e-spec.ts` |
| C10 | Configuración por cuenta contra `settings` de Meta | CUMPLE (activación real [usuario]) | `call-settings.spec.ts`; `calls.e2e-spec.ts` |
| C11 | Sin módulo `calls`: sin menú, 403 y sin sala | CUMPLE | `calls.e2e-spec.ts`; `conversations.gateway.spec.ts` |
| C12 | Micrófono denegado: explica, no reserva ni acepta | CUMPLE | `calls.service.spec.ts` (frontend); e2e de navegador "micrófono denegado" |
| C13 | Firma obligatoria, logs sin teléfonos ni SDP, idempotencia | CUMPLE | `shared/meta-signature.spec.ts`; `whatsapp-webhook.controller.spec.ts`; `calls.e2e-spec.ts` |
| C14 | Pruebas unitarias, e2e de API y de navegador | CUMPLE | ver Pruebas |
| C15 | `npm run verify` completo | CUMPLE por pasos | El comando único lo cortó el sistema por memoria; todos sus pasos se corrieron por separado (abajo) |
| C16 | KPIs de llamadas en el panel | CUMPLE | `dashboard-analytics.service.spec.ts`; `pages/dashboard/dashboard.spec.ts` |

## Qué se implementó

- Backend `src/calls/`: webhook `calls` firmado, máquina de estados, reserva atómica, tiempo de espera, permisos y salientes contra la Calling API de Meta, configuración por cuenta, historial, registro en ficha y chat, push.
- Socket: salas `calls:` por módulo y eventos `call:*`.
- Frontend: aviso de llamada global, panel en curso (cronómetro, silenciar, colgar), página `/llamadas`, botón "Llamar" en historial, ficha y chat, configuración por cuenta, categoría de notificaciones, KPIs del panel.
- WebRTC directo navegador ↔ Meta; el servidor solo coordina (ADR 0002).
- Campo *App Secret* por cuenta y variables `META_CALLING_GRAPH_VERSION` y `CALLS_ICE_SERVERS`.

## Lo que tiene que hacer el usuario

- Seguir [`docs/llamadas-whatsapp.md`](../../../docs/llamadas-whatsapp.md): requisitos de Meta, suscribir `calls` en el webhook, `FACEBOOK_APP_SECRET` / App Secret, activar llamadas en el número, roles personalizados y prueba manual.

## Pruebas

- Unitarias backend: 110 suites, 1472/1472.
- e2e de API: 7 suites, 81/81.
- Unitarias frontend: 69 archivos, 727/727.
- Build backend, build frontend, lint y `tsc --noEmit` del backend: OK.
- e2e de navegador: 22/22 (incluye las 4 de llamadas). Se corrigió `frontend/e2e/users.e2e.ts`, que leía en claro el código de recuperación que HU5 ya guarda con hash.

## Pendientes, riesgos y notas

- Sin verificación independiente (spec-verifier bloqueado).
- Audio real, push real y activación en Meta: solo verificables por el usuario con un número habilitado (límite de 2 000 conversaciones/día).
- Redes que bloquean UDP necesitan un TURN en `CALLS_ICE_SERVERS`.
