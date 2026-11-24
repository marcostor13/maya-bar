# Cierre HU63 — Registro de actividad

## Qué quedó
- `audit_log` con retención de 12 meses (TTL) e índices por empresa y fecha. El registro nunca rompe la operación que lo origina y filtra claves sensibles (`pass`, `token`, `secret`, `key`, `code`…).
- Interceptor global + `@Audit` en 60 rutas: usuarios y roles, exportar/importar, borrar contactos y conversaciones, canales (WhatsApp, Instagram, Messenger, correo, Resend, SMS), claves de API, plan y complementos, acciones del superadmin (se guardan en la empresa afectada) y 2FA.
- Inicio de sesión: correcto (con método: contraseña, 2FA, código de respaldo, alta de 2FA) y fallido (credenciales, cuenta bloqueada, código 2FA incorrecto), atribuido a la empresa del correo.
- `GET /audit` (solo administrador de la empresa; superadmin todo o por `tenantId`), filtros por correo, acción, desde/hasta, paginación; `GET /audit/export.csv`.
- Configuración → Registro de actividad (`/settings/activity`).

## Verificación
- spec-verifier bloqueado por el hook. Autoverificación:
  - C1 CUMPLE — `test/audit.e2e-spec.ts` C1: tras exportar 3 contactos hay `customers.export` con el correo, el `userId`, `rows: 3` y la fecha; el CSV del registro lo incluye.
  - C2 CUMPLE — e2e C2: la empresa B no ve registros de A ni forzando `tenantId`, ni en el CSV; un MANAGER recibe 403; el superadmin filtra por empresa.
  - Extra: login fallido sin la contraseña en el registro, `users.created` sin la clave temporal, acción del superadmin visible para la empresa, filtro por correo.
- Pruebas: e2e propia (3); e2e completa `npm run test:e2e` 264/264; unitarias del backend 1791 en verde (los 4 de `rag.service.spec` fallan solo al correr jest sin `--experimental-vm-modules`, ajeno); frontend `activity-log.spec.ts` (3), build OK.
