# HU58 — Automatizaciones y secuencias

## Historia

**Como** responsable de ventas o marketing,
**quiero** armar reglas del tipo "cuando pase esto, espera y haz aquello",
**para** dar seguimiento a cada contacto sin hacerlo a mano.

## Contexto (estado actual)

- No hay motor de automatizaciones (no se encontró `automation`, `sequence` ni `workflow`). Es la brecha número 1 frente a Kommo (Salesbot), respond.io, Clientify y HubSpot.
- Piezas que ya existen y se pueden reutilizar:
  - Envío de WhatsApp (plantillas y ventana de 24 h, HU27), email y SMS con worker y cron (`CampaignSenderService`).
  - Etapas de oportunidad (`leads/lead-stage.schema.ts`), etiquetas, listas, formularios y el webhook de salida (HU15).

## Propuesta

1. **Disparadores**:
   - Formulario enviado, contacto creado y etiqueta añadida.
   - Cambio de etapa de la oportunidad.
   - Registro a un evento y sin respuesta en X horas o días.
   - Fecha de un campo (por ejemplo, cumpleaños).
2. **Pasos**:
   - Esperar (tiempo o hasta una hora del día).
   - Enviar WhatsApp: plantilla si la ventana de 24 h está cerrada.
   - Enviar email o SMS.
   - Añadir o quitar una etiqueta y mover de etapa.
   - Asignar un responsable (round-robin, HU59) y crear un recordatorio.
   - Llamar al webhook.
   - Condición simple (si respondió, si tiene etiqueta…).
3. Editor de pasos en lista vertical (no un lienzo libre), usable en el móvil, a pantalla completa con `app-form-page`.
4. Ejecución en un worker con estado por contacto (`automation_runs`):
   - Idempotente, con salida si el contacto responde, si está en "no contactar" o si se sale de la regla.
   - Respeta la lista de no contactar y los horarios.
5. Plantillas listas: "Seguimiento de lead del formulario (3 toques)", "Recordatorio de evento 24 h antes" y "Reactivación a los 30 días".
6. Métricas por automatización: entraron, completaron, respondieron y salieron.

## Fuera de alcance

- Lienzo visual con ramas complejas y A/B dentro de la secuencia.

## Criterios de aceptación (borrador)

- C1: un formulario enviado inscribe al contacto; a los 0 min envía la plantilla 1 y a las 24 h el email (reloj simulado).
- C2: si el contacto responde antes del paso 2, sale de la secuencia.
- C3: un contacto en "no contactar" nunca recibe pasos de envío.
