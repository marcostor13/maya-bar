# Cierre HU58 — Automatizaciones y secuencias

## Qué quedó
- Backend `src/automations/`: bus de hechos del CRM (formulario, contacto nuevo, etiqueta, etapa, inscripción a evento) sin inyección; reglas y ejecuciones en Mongo (`automations`, `automation_runs`) con índice único de ejecución activa por contacto y candado por ejecución (continúa tras reinicio).
- Disparadores: formulario, contacto nuevo, etiqueta, cambio de etapa, inscripción a evento, sin respuesta y fecha de un campo.
- Pasos: esperar, WhatsApp (texto con ventana abierta, plantilla con ventana cerrada, se omite con motivo sin plantilla), email con baja, SMS, etiquetar/quitar, etapa, responsable, recordatorio, webhook (solo https público, HMAC, sin redirecciones, 10 s) y condición.
- Salida por respuesta (mensaje entrante), por "no contactar" y por dejar de cumplir la regla; horario de envío; plantillas listas (inactivas al crearlas).
- Permisos: módulo `campaigns`, roles TENANT_ADMIN/MANAGER/MARKETING, función de plan `automations`.
- Frontend `/automatizaciones`: lista con métricas, plantillas, editor a pantalla completa con pasos verticales y ejecuciones recientes; entrada en el menú.

## Verificación
- spec-verifier: no se pudo lanzar (el hook de context-mode cambia la llamada y el modo automático la rechaza dos veces). Autoverificación por criterio:
  - C1 CUMPLE — `test/automations.e2e-spec.ts` C1: plantilla al instante y email a las 24 h con reloj simulado.
  - C2 CUMPLE — e2e C2: responde antes del paso 2, sale como "respondió" y no recibe el email.
  - C3 CUMPLE — e2e C3: contacto en "no contactar" sale con `suppressed` sin envíos.
  - R6 (etiqueta quitada → sale) y horario de envío cubiertos por el e2e de etiquetas; R9 revisado en `callWebhook` (https, `assertPublicUrl`, `redirect: 'manual'`, firma).
- Pruebas: `automation-steps.spec.ts` (4), e2e propia (5), `automations.spec.ts` (4). Suite e2e completa 246/246; frontend 971/973 (los 2 fallos, de eventos y landing, por tiempo bajo carga: pasan solos 12/12); builds OK.

## Pendiente
- Prueba real con WhatsApp, email y SMS de verdad (HU66).
