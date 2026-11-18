# HU16 — Administración total de las empresas · Cierre

- **Cerrada:** 2026-11-18
- **Estado:** Terminada (pendiente revisión visual del usuario)
- **Verificación (spec-verifier):** 8 CUMPLE · 0 PARCIAL · 0 NO CUMPLE
- **Commits:** sin commit

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Estado | Evidencia |
|---|---|---|
| C1 búsqueda y filtros | CUMPLE | `tenants.ts` `filtered()`; `tenants.spec.ts` |
| C2 ficha con usuarios y uso | CUMPLE | `GET /admin/tenants/:id/overview`; e2e |
| C3 edición validada, correo único | CUMPLE | `UpdateTenantDto`; e2e 400/409 |
| C4 suspensión efectiva | CUMPLE | login, refresh, JWT (`ActiveUserCache`), claves de API (`ApiKeyGuard`); e2e |
| C5 eliminar con el nombre exacto | CUMPLE | e2e 400/200; unitaria |
| C6 registro de acciones | CUMPLE | colección `tenant_audit`; e2e |
| C7 solo SUPERADMIN | CUMPLE | e2e 403 |
| C8 ficha en pantalla completa | CUMPLE | `tenant-detail.spec.ts` |

## Correcciones tras la verificación

- El uso cuenta también el proveedor SMS.
- El registro ya no inventa un `actorId` si el actor no es un id válido.
- `@MaxLength(254)` en los correos de empresa.

## Riesgos aceptados

- Los websockets abiertos no se cortan al suspender: la siguiente petición HTTP sí da 401 (mismo comportamiento que al desactivar un usuario).
- Caché de 60 s por instancia: con varias réplicas, el corte puede tardar hasta un minuto.
- El uso cuenta cuentas configuradas, no solo las conectadas.

## Lo que tiene que hacer el usuario

- Revisar la ficha en `/admin/tenants` y probar suspender y reactivar una empresa de prueba.
