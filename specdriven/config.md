# Configuración del proyecto — Maya CRM

Único archivo de `specdriven/` que cambia entre proyectos.

## Idioma

- Documentos y respuestas al usuario: **español**.

## Contexto y convenciones

- Reglas generales y de interfaz: `CLAUDE.md` (raíz). Design system: `docs/kitui.md`.
- Recetas del proyecto (skills): `maya-backend-module`, `maya-frontend-page`,
  `maya-outbound-send`, `maya-test-backend`, `maya-test-frontend`, `maya-e2e`.
- Exploración de código: `codebase-memory-mcp` primero.
- Multitenancy: `tenantId` siempre del JWT; permisos con `JwtAuthGuard` +
  `ModuleGuard` + `assertRole`.
- Feedback en la interfaz: `ToastService` y `ConfirmService` (nunca `alert`/`confirm`).

## Verificación mecánica

Mínimo en cada historia (skill `maya-verify`):

```bash
cd backend && npm run build
cd backend && npm test
cd frontend && npx ng test frontend --watch=false
cd frontend && npm run build
```

Si la historia toca un flujo de punta a punta: `npm run verify` (raíz), que
añade lint, e2e de API y e2e de navegador.

## Documentos para el usuario

- Indicaciones de configuración externa (Google, Meta, Microsoft, Cloudflare…):
  `docs/<tema>.md`.

## Reglas propias

- Commits y deploys solo cuando el usuario lo pida. Deploy: Coolify desde
  `origin/main` (automático al hacer push).
- Nunca introducir credenciales, aceptar términos ni marcar casillas legales en
  consolas externas: se le indica al usuario.
