# HU58 — Plan

## Backend `src/automations/`
- `automation-bus.ts`: EventEmitter de módulo (sin DI) con `emitAutomation(event)`; lo llaman formularios, contactos, etiquetas (contactos, acciones masivas, bandeja), oportunidades (mover/editar etapa) y registros a eventos.
- `automation.schema.ts` (`automations`) y `automation-run.schema.ts` (`automation_runs`, índice único parcial `{automationId, customerId}` con `status: 'active'`).
- `automation-steps.ts`: tipos, validación de pasos y cálculo de esperas/horario (puro, con prueba unitaria).
- `automation-templates.ts`: 3 plantillas.
- `automations.service.ts`: CRUD, plantillas, métricas, `enroll`, escucha del bus y de `MessageEvents` (respuesta → salida).
- `automation-engine.service.ts`: `@Cron` cada 30 s → `tick(now)`; reclama ejecuciones vencidas con candado; ejecuta pasos; barridos de "sin respuesta" y "fecha de campo".
- `automation-actions.service.ts`: envíos (WhatsApp vía `ConversationsService.sendExternal` con `api` opcional, email Resend/plataforma, SMS), etiquetas, etapa, responsable, recordatorio, webhook (`assertPublicUrl` + HMAC).
- Controlador `automations` con `JwtAuthGuard` + `ModuleGuard('campaigns')` + `assertFeature('automations')`.

## Frontend
- `pages/automations/automations.ts`: lista con métricas, activar/pausar, crear desde plantilla o en blanco.
- `automation-editor.ts`: `app-form-page` con disparador, pasos en lista vertical (añadir, mover, quitar), horario y "salir si responde".
- Ruta `/automations` + entrada de menú (Workflow icon).

## Pruebas
- Unitarias: `automation-steps.spec.ts`.
- e2e `test/automations.e2e-spec.ts`: C1, C2, C3 + etiqueta/salida de la regla + permisos.
- Frontend: `automations.spec.ts`.
