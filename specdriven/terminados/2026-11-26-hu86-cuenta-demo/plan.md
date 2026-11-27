# HU86 — Cuenta demo · Plan técnico

## Estado actual

- No hay seeds ni cuenta demo (`backend/scripts/` solo tiene utilidades; en producción solo existe "Empresa de prueba" vacía).
- Esquemas: `tenants/tenant.schema.ts`, `users/user.schema.ts`, `customers/customer.schema.ts`, `leads/lead.schema.ts`, `leads/lead-stage.schema.ts`, `conversations/conversation.schema.ts`, `conversations/message.schema.ts`, `whatsapp-accounts/whatsapp-account.schema.ts`, `ai-agents/ai-agent.schema.ts`.

## Diseño

- **Datos:** `Tenant.demo?: boolean` (aditivo). Slug `maya-demo`, correo `demo@demo.mayacrm.site`.
- **`demo/demo-data.ts`:** generador puro y determinista (PRNG con semilla, fecha base) que devuelve los documentos planos con sus ObjectId y referencias.
- **`demo/demo.service.ts`:** `reset()`:
  1. Busca empresas con el slug o el correo de la demo; si alguna no es `demo: true` → 409.
  2. Borra `deleteMany({ tenantId })` en todas las colecciones de la conexión que tengan ese campo, y la empresa.
  3. Inserta con `Model.insertMany` (casteo y valores por defecto) conservando `createdAt` históricos (`timestamps: false` en la inserción).
  4. Contraseña aleatoria (`randomBytes`), bcrypt 10.
- **API:** `POST admin/demo/reset` (SUPERADMIN, auditado sin datos sensibles) → `{ email, password, users: [...] }`.
- **Interfaz:** componente `DemoResetButton` en la cabecera de Empresas: `ConfirmService`, POST, modal con accesos y botón copiar, toast.

## Seguridad

Superadmin en el servidor; borrado acotado por `demo: true` + `tenantId`; contraseña solo en la respuesta (no en logs ni auditoría).

## Observabilidad

Log con el id de la empresa demo y conteos insertados.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Borrar datos reales | Comprobación `demo: true`, 409 si el slug/correo son de otra empresa, prueba C2/C7 |
| Esquemas cambian y la demo queda inválida | Inserción con los modelos reales y e2e con Mongo en memoria |

## Pruebas

Unitaria del generador, e2e del servicio con `mongodb-memory-server`, controlador, frontend.

## Fases

1. Backend + botón. 2 (futuro): campañas, automatizaciones, formularios.
