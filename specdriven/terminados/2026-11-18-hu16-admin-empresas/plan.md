# HU16 — Administración total de las empresas · Plan técnico

## Estado actual

- `backend/src/tenants/tenants.controller.ts`: CRUD de SUPERADMIN; `remove` borra todos los modelos con `tenantId`.
- `Tenant.isActive` no se comprueba en ningún sitio (auth, sesiones, API).
- `frontend/src/app/pages/admin/tenants.ts`: tabla + modal.

## Diseño

- **Datos:** `tenant_audit` (actorId, actorEmail, tenantId, tenantName, action
  `create|update|suspend|reactivate|delete`, changes, at).
- **Suspensión:** `TenantGate` (auth) con caché de 60 s por empresa:
  - `AuthService.validateUser` y `refresh` → 401 "Tu empresa está suspendida…";
  - `ActiveUserCache` marca inactivo al usuario de una empresa suspendida;
  - `ApiAccessService.authenticate` descarta claves de empresas suspendidas.
- **API:** `GET /admin/tenants/:id/overview`, `GET /admin/tenants/:id/audit`;
  `PATCH /tenants/:id` con DTO validado (plan enum, fechas, correo único);
  `DELETE /tenants/:id` con `{ confirmName }`.
- **Interfaz:** buscador y filtros en la lista; clic en la empresa → ficha
  `app-form-page` (datos, usuarios, uso, registro, suspender/reactivar, eliminar).

## Seguridad

Solo SUPERADMIN (403). Correo único (409). Eliminación con confirmación por nombre en el servidor.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Varias instancias: caché de 60 s | El corte llega como mucho en 60 s en las otras |
| Agente IA y campañas siguen activos en empresa suspendida | Anotado como fuera de alcance |

## Estrategia de pruebas

Unitarias de `TenantsService`/`TenantGate`; e2e en `test/platform.e2e-spec.ts`; unitaria de la pantalla.

## Fases

1. Backend (suspensión, overview, auditoría, DTO) → 2. Pantalla.
