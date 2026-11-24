# HU66 — Prueba real de recuperación, SMS y email · Especificación

Historia: `hu.md` · Fecha: 2026-11-24 · Estado: aprobada

## Objetivo
Validar con cuentas reales la recuperación, las campañas de SMS y email y los links cortos antes de venderlos en el plan Escala.

## Alcance
- Incluye:
  - El guion de prueba manual (`docs/prueba-real-recuperacion-sms-email.md`).
  - Una prueba automática de reanudación tras un reinicio (C2).
  - La medición del costo real de IA por unidad y por acción: `units` en el libro de consumo y `GET /billing/admin/ai-usage/by-action`.
- **Fuera de alcance:** ejecutar la prueba real, porque requiere las cuentas del usuario (C1, C3).

## Requisitos (EARS)
- **R1** — Si el backend se reinicia durante el análisis, el sistema debe retomar sin volver a clasificar lo ya guardado.
- **R2** — El sistema debe calcular el costo real de IA por unidad de cada acción en un mes.

## Criterios de aceptación
| # | Req. | Criterio | Cómo se verifica |
|---|---|---|---|
| C1 | — | [usuario] Una campaña de recuperación real envía al menos 20 mensajes y las respuestas llegan a la bandeja | Guion paso 1 |
| C2 | R1 | Un reinicio durante el análisis no pierde lo ya clasificado | e2e |
| C3 | — | [usuario] El email llega a Principal de Gmail con DKIM válido | Guion paso 2 |
