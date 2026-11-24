# Cierre HU59 — Reparto automático round-robin

## Qué quedó
- Backend `src/routing/`: reglas (`routing_rules`) por origen (cualquiera, canal del contacto, formulario, origen de la oportunidad) con orden, modo (turno rotativo con cursor atómico, menos abiertas, ponderado), grupo con pesos, tiempo de respuesta y qué hacer al vencer (siguiente o bolsa). Bitácora `routing_assignments` + actividad `assignment` en la oportunidad o el contacto.
- Disponibilidad por usuario (`available`, `availability` en hora de Lima) editable por cada uno en `PATCH /routing/availability`.
- Eventos `lead_created` (oportunidad sin responsable) y `contact_created` con `formId`; la oportunidad de un contacto con dueño va a ese dueño.
- Cron por minuto: sin actividad del responsable en el plazo, pasa al siguiente disponible o vuelve a la bolsa, con push y registro.
- Frontend: sección "Reparto automático" en Configuración (TENANT_ADMIN/MANAGER) con reglas, orden, pausa, editor a pantalla completa y últimas asignaciones; interruptor "Disponible" y horario propio en Seguimiento.

## Verificación
- spec-verifier: no se pudo lanzar (mismo bloqueo del hook). Autoverificación:
  - C1 CUMPLE — `test/routing.e2e-spec.ts` C1: 6 oportunidades → 2, 2 y 2, sin repetir seguido.
  - C2 CUMPLE — e2e C2: no disponible y fuera de horario no reciben; sin nadie queda en la bolsa con `no_one`.
  - C3 CUMPLE — e2e C3 con reloj simulado: a los 16 min pasa al siguiente con entrada `timeout_next`, actividad y push; con respuesta se queda.
  - R5/R6 — e2e: dueño del contacto, vendedor sin permiso (403), aislamiento entre empresas (404/400).
- Pruebas: `routing-pick.spec.ts` (3), e2e (4), `routing-settings.spec.ts` (4) y `leads.spec.ts` ajustado. Build backend y frontend OK.

## Pendiente
- Ninguno de la historia. Las oportunidades sin responsable siguen avisando al equipo como antes (además del reparto).
