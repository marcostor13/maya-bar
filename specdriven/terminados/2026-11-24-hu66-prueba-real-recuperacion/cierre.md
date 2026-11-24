# Cierre HU66 — Prueba real de recuperación, SMS y email

## Qué quedó
- **Guion paso a paso** en `docs/prueba-real-recuperacion-sms-email.md`:
  - Pruebas: recuperación con dos reinicios (durante el análisis y durante el envío), email con DKIM y SPF, aperturas, clics y baja, SMS y link corto propio.
  - Cierre: tabla de resultados y regla de decisión para el plan Escala.
- **Costo real de IA:**
  - Cada consumo guarda sus `units` (conversaciones en recuperación).
  - `GET /billing/admin/ai-usage/by-action?period=AAAA-MM` (superadmin) devuelve llamadas, unidades, tokens, US$ y `costPerUnitUsd` por acción, sin las llamadas con key propia.

## Verificación
spec-verifier sigue bloqueado por el hook, así que la verificación es propia:
- **C2 CUMPLE** — `test/recovery-resume.e2e-spec.ts`:
  - Hay 50 conversaciones.
  - El primer proceso guarda 45 en el checkpoint y falla en el 4.º lote; luego se cierra la app.
  - Una segunda instancia sobre la misma base envía a la IA un solo lote con las 5 que faltaban, sin ninguna de las 45.
  - El plan queda en `review` con los 50 destinatarios y las notas del primer proceso intactas.
- **C1 PENDIENTE [usuario]** — requiere WhatsApp Cloud API y teléfonos reales (guion, paso 1).
- **C3 PENDIENTE [usuario]** — requiere Resend con dominio propio y Gmail (guion, paso 2).
- **Pruebas:** `ai-credits.service.spec` 9/9 (incluye el costo por unidad); build OK.

## Pendiente [usuario]
- Ejecutar el guion y rellenar la tabla.
- Por cada fallo, una historia con su prueba automática.
- Ajustar `CREDIT_COSTS.recovery` según `costPerUnitUsd`.
