# Cierre HU64 — Reportes configurables

## Qué quedó
- Motor `ReportsService.run` con agregación de Mongo por empresa y rango (tope 366 días, hora de Lima), cinco fuentes, cuatro métricas y doce agrupaciones validadas por fuente; máximo 100 grupos.
- Reportes guardados (`/reports`): ve el administrador, quien lo creó y los roles compartidos; editan el administrador o quien lo creó (gerente). Fijados → tarjeta "Mis reportes" en el dashboard. CSV (protegido contra fórmulas) y envío por correo semanal o mensual (cron 8:00 Lima) o "Enviar ahora".
- Creación, edición, borrado y exportación quedan en la auditoría (HU63).
- Frontend: Reportes en el menú (permiso del dashboard), constructor a pantalla completa con vista previa, tarjetas con tabla, barras o línea.

## Verificación
- spec-verifier bloqueado por el hook. Autoverificación:
  - C1 CUMPLE — `test/reports.e2e-spec.ts` C1: con 8 oportunidades sembradas (incluida una ganada hace más de un año) el reporte da A=3 y B=1, igual que `countDocuments` hecho a mano sobre la base; total 4; suma de monto 600; tasa de conversión 62,5 %.
  - C2 CUMPLE — e2e C2: fijado y compartido con MARKETING aparece en `/reports/pinned` del rol MARKETING con total 4; no en HOST (404 al pedirlo); MARKETING no lo edita (403); otra empresa no lo ve; desfijar lo quita. `reports.spec.ts`: la tarjeta del dashboard lo pinta.
- Pruebas: `report-definition.spec.ts` (3), e2e propia (3) y `app.e2e` en verde, frontend 992/992, build OK.

## Pendiente
- El envío programado usa el correo de la plataforma (`MailService`); en desarrollo sin Resend solo queda en el log.
