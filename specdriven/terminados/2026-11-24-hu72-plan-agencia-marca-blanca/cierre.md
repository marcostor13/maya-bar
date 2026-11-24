# HU72 — Plan agencia y marca blanca · cierre

Verificación: autoverificación (el agente spec-verifier está bloqueado por el hook en modo automático).

| Criterio | Estado | Evidencia |
|---|---|---|
| C1 | CUMPLE | `backend/test/agency.e2e-spec.ts` "C1": el superadmin activa 5 sub-cuentas; la agencia crea 5 (la 6.ª da 403), `/agency` las lista, entra a cada una con `/auth/switch-tenant` (`tenantId` del cliente, `homeTenantId` de la agencia), lo que crea queda en el cliente, el refresh mantiene la sub-cuenta, vuelve a la agencia; entrar a una empresa ajena da 403, y otra empresa no puede entrar a las suyas. Frontend: `agency.spec.ts` (5 filas, Entrar, Volver) |
| C2 | CUMPLE | mismo e2e "C2": `/public/white-label?host=crm.andes.pe` devuelve nombre, logo y color sin "Maya"; el preflight CORS desde el dominio del panel pasa y desde uno ajeno no; dentro de una sub-cuenta `/agency/brand` es la de la agencia. Frontend: `brand.service.spec.ts` (título, logo, color, la raíz deja de ser landing) |

## Pruebas
- Backend: e2e agency 2/2 y app 6/6; unitarias auth, mail, tenants y billing 166/166 (se ajustó `auth.service.spec` por el nuevo argumento de marca); build y lint OK.
- Frontend: 31 archivos / 236 pruebas (shell, login, auth, shared, agencia, marca) y tenant-detail 8/8; `ng build frontend` OK.

## Pendiente del usuario
- Vender el plan: activar la agencia desde Empresas → detalle → "Plan Agencia".
- Dominio del panel: la agencia apunta un CNAME a la app y el operador añade ese dominio en Coolify (TLS) y lo incluye en el server de Angular (`NG_ALLOWED_HOSTS`) si se sirve con SSR.
- Fase 2: cobro de la agencia a sus clientes y precio mayorista de sub-cuentas extra en el checkout.
