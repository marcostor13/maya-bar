# HU27 — Volver a contactar cuando venció la ventana de 24 h · Cierre

- **Cerrada:** 2026-11-21
- **Estado:** Terminada con pendientes del usuario
- **Verificación (spec-verifier):** 8 CUMPLE, 1 NO VERIFICADO (C9, usuario)
- **Commits:** ver `git log` (HU27)

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Estado de la ventana por chat | CUMPLE | `backend/src/conversations/wa-window.ts`, `conversations.service.ts` `windowStatus`; `conversations.window.spec.ts`, e2e `inbox-template.e2e-spec.ts` |
| C2 | Compositor sustituido por "Enviar plantilla"; se reabre al llegar un entrante | CUMPLE | `frontend/.../inbox/inbox.ts` (`chatWindow`), `wa-window.ts`; `wa-template-picker.spec.ts` |
| C3 | Plantilla rellenada, marcada y enviada con la API de plantillas | CUMPLE | `conversation-templates.service.ts`, `sendTemplateMessage`, `deliver`; unitarias + e2e |
| C4 | 422 sin variables / otra cuenta / no aprobada | CUMPLE | `whatsapp-templates/template-send.ts`; unitarias + e2e |
| C5 | 409 al texto libre fuera de ventana (bandeja, reintento, programados) | CUMPLE | `sendManual`, `retryMessage`; unitarias + e2e |
| C6 | El agente IA no envía fuera de ventana | CUMPLE | `sendFromAgent` (salvo la respuesta a llamada perdida, HU6) |
| C7 | El reintento de una plantilla sale como plantilla | CUMPLE | `deliver` con `msg.template`; `conversations.window.spec.ts` |
| C8 | Aislamiento por empresa y rol | CUMPLE | e2e `inbox-template.e2e-spec.ts` |
| C9 | Reabrir un chat real en producción | NO VERIFICADO | **[usuario]** |

## Qué se implementó

- `GET /conversations/:id/window`, `GET /conversations/:id/templates`, `POST /conversations/:id/messages/template`.
- `Message.template`: los reintentos (manual y automático) salen como plantilla.
- Texto libre fuera de ventana rechazado con 409 y mensaje claro; agente IA sin envíos fuera de ventana.
- Bandeja: cuenta atrás, "Enviar plantilla" con la ventana cerrada, chip "Plantilla · nombre", modal `wa-template-picker` (Utilidad primero, `{{1}}` con el nombre, vista previa).
- Helpers comunes `template-send.ts` (la API de HU13 pasa a usarlos) y `wa-window.ts`.

## Lo que tiene que hacer el usuario

- Crear y aprobar en Meta al menos una plantilla (sugeridas en `docs/whatsapp-ventana-24h.md`) y probar a reabrir un chat de más de 24 h.

## Pruebas

- Backend unitarias: 1687/1687 · e2e de API: 128/128 (el teardown del Mongo en memoria falló por falta de memoria del equipo, no una prueba).
- Frontend unitarias: 872/872 · build OK · e2e de navegador: 24/24.

## Pendientes, riesgos y notas

- La cuenta atrás usa el reloj del dispositivo; con un reloj desfasado puede mostrar mal el tiempo (el backend sigue bloqueando con 409).
- El reintento automático (HU7) de un texto libre no mira la ventana: si vence, vuelve a fallar en Meta.
- Ventana de 72 h de anuncios Click-to-WhatsApp tratada como 24 h.
- Foco del modal: no se atrapa ni se devuelve al cerrar.
