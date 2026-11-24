# HU63 — Plan
- `src/audit/`: `audit.service.ts` (esquema `audit_log` con TTL 365 días, `log`, `loginOk`, `loginFailed`, `twoFactorFailed`, `list`, `actions`, `exportCsv` con protección contra fórmulas, `sanitizeDetails`), `audit.decorator.ts` (`@Audit`, `pickNumbers`), `audit.interceptor.ts` (APP_INTERCEPTOR), `audit.controller.ts` (`GET /audit`, `/audit/actions`, `/audit/export.csv`), `audit.module.ts` global.
- `@Audit` en 20 controladores (contactos, importación, conversaciones, usuarios, roles, canales, API, plan, complementos, superadmin, 2FA). Exportaciones añaden `rows`.
- Login y 2FA: registro manual de éxito y fallo.
- Frontend: `pages/settings/activity-log.ts` en `/settings/activity` (solo administrador) y acceso desde Configuración.
