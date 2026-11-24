# HU58 — Automatizaciones y secuencias · Especificación

Historia: `backlog/hu58-automatizaciones-y-secuencias.md` · Fecha: 2026-11-24 · Estado: aprobada

## Objetivo

Reglas "cuando pase X, espera y haz Y" para dar seguimiento a cada contacto sin trabajo manual: el motor que falta frente a Kommo/HubSpot.

## Usuarios

- Admin / supervisor de ventas o marketing: crea, activa y mide automatizaciones.
- Contacto final: recibe los toques; puede responder o darse de baja y sale.

## Alcance

- Incluye:
  - Disparadores: formulario enviado, contacto creado, etiqueta añadida, cambio de etapa, registro a evento, sin respuesta en X horas, fecha de un campo personalizado (día/mes, con desfase de días).
  - Pasos: esperar (minutos/horas/días, hasta una hora del día, N horas antes del evento), WhatsApp (texto si la ventana de 24 h está abierta; si no, plantilla aprobada), email, SMS, añadir/quitar etiqueta, mover de etapa la oportunidad abierta, asignar responsable (usuario fijo), recordatorio (tarea en la oportunidad abierta o nota en el contacto), webhook (POST JSON firmado a URL pública https), condición (respondió / tiene etiqueta → salir o saltar el siguiente paso).
  - Editor en lista vertical a pantalla completa (`app-form-page`), usable en móvil.
  - Worker con estado por contacto (`automation_runs`), idempotente; salida al responder (si la regla lo pide), por "no contactar" o si deja de cumplir la regla.
  - Horario de envío (hora desde/hasta en zona America/Lima): un paso de envío fuera de horario se pospone.
  - 3 plantillas listas y métricas por automatización (entraron, completaron, respondieron, salieron).
- **Fuera de alcance:** lienzo visual, ramas complejas, A/B, round-robin (HU59).

## Requisitos (EARS)

Funcionales:
- **R1** — Cuando ocurre el disparador de una automatización activa, el sistema debe inscribir al contacto una sola vez mientras tenga una ejecución activa en ella.
- **R2** — Cuando llega la hora de un paso, el worker debe ejecutarlo y avanzar hasta la siguiente espera o el final.
- **R3** — Cuando el contacto responde (mensaje entrante en cualquier canal) y la regla tiene "salir si responde", el sistema debe terminar su ejecución como "respondió".
- **R4** — Si el contacto está en "no contactar", entonces el sistema no debe ejecutar ningún paso de envío y debe sacarlo de la secuencia.
- **R5** — Si la ventana de 24 h está cerrada y el paso no tiene plantilla, entonces el paso se omite con el motivo registrado.
- **R6** — Si el contacto deja de cumplir la regla (se quitó la etiqueta, la oportunidad cambió de etapa), entonces sale como "salió de la regla".
- **R7** — Un fallo de un paso queda en el historial de la ejecución y no detiene las demás.

No funcionales:
- **R8** — Multitenant: todo por `tenantId` del JWT; módulo `campaigns` + función de plan `automations`.
- **R9** — El webhook solo admite URLs públicas https (sin SSRF) y firma HMAC.
- **R10** — Tras un reinicio el worker continúa donde se quedó (estado en Mongo, candado por ejecución).

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1, R2 | Dada una automatización "formulario enviado" con plantilla WhatsApp a los 0 min y email a las 24 h, cuando se envía el formulario, entonces se manda la plantilla de inmediato y el email al avanzar el reloj 24 h | e2e con reloj simulado (`tick(now)`) |
| C2 | R3 | Si el contacto responde antes del paso 2, sale y no recibe el email | e2e |
| C3 | R4 | Un contacto en "no contactar" nunca recibe pasos de envío | e2e |

## Supuestos y decisiones por defecto

- Zona horaria del horario de envío: America/Lima (no hay zona por empresa).
- Registro a evento: se busca el contacto por email/teléfono; si no existe se crea con `source: 'event'`.
- "Sin respuesta en X horas": conversaciones cuyo último mensaje es saliente y tiene más de X horas, sin entrante después; se revisa cada 15 min.
- WhatsApp sale por la cuenta elegida en el paso o la primera cuenta Cloud API activa de la empresa.

## Preguntas abiertas

- ninguna
