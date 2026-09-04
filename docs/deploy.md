# Despliegue — Coolify + Cloudflare + GitHub Actions

Monorepo con dos aplicaciones desplegadas en la misma instancia de Coolify
(`98.87.37.45`), cada una desde su propio `Dockerfile`:

| App        | Ruta        | Dominio                | Puerto | UUID en Coolify            |
| ---------- | ----------- | ---------------------- | ------ | -------------------------- |
| Backend    | `backend/`  | `api.mayacrm.site`     | 3080   | `rnpftccijri2129swfvt5y0l` |
| Frontend   | `frontend/` | `mayacrm.site` (+`www`)| 4000   | `lt1sd98ttf38pbd9oi3jmagm` |

El frontend es Angular con SSR: la imagen final ejecuta el servidor Express que
genera `@angular/build` (`dist/frontend/server/server.mjs`), no un nginx
estático. La landing sigue prerenderizada (`/` se sirve como SSG) y el resto de
rutas las resuelve el shell de cliente.

## DNS (Cloudflare, sin túnel)

`mayacrm.site`, `www.mayacrm.site` y `api.mayacrm.site` son registros **A** que
apuntan directamente a `SERVER_IP`. Van **en gris** (`proxied: false`) porque
Traefik emite los certificados por el reto HTTP-01 de Let's Encrypt y el proxy
naranja lo interceptaría. Solo activa `CLOUDFLARE_PROXIED=true` cuando los
certificados ya estén emitidos y quieras el CDN delante.

```bash
npm run dns:check   # informa diferencias, no escribe
npm run dns         # crea/actualiza los registros
```

## Aprovisionamiento de Coolify

`scripts/provision.js` es idempotente: crea las aplicaciones si faltan y, si
existen, alinea dominios, puertos, `watch_paths` y variables de entorno con el
`.env`. También deja `is_auto_deploy_enabled: false` en ambas para que el único
disparador de despliegues sea GitHub Actions (con el webhook de la GitHub App
activo habría dos despliegues por cada push).

Las notificaciones push necesitan además `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY` y (opcional) `VAPID_SUBJECT` en el backend — ver
[docs/notificaciones-push.md](notificaciones-push.md). Sin ellas el backend
arranca igual y las notificaciones quedan desactivadas.

```bash
npm run coolify:list      # proyectos, servidores, GitHub Apps y aplicaciones
npm run provision:check   # dry-run
npm run provision         # aplica; imprime los UUID para los secrets
```

## CI/CD

`.github/workflows/deploy.yml` corre en cada push a `main`:

1. **changes** — `git diff` contra el commit anterior decide si cambió
   `backend/`, `frontend/` o la infraestructura común (`scripts/`,
   `package.json`, `.github/workflows/`, que redespliegan ambas).
2. **ci** — invoca `.github/workflows/ci.yml` (reusable) solo para las partes
   que cambiaron: lint, typecheck, tests y build.
3. **deploy-backend / deploy-frontend** — solo si CI pasa. Llaman a
   `scripts/deploy.js`, que lanza el despliegue por la API de Coolify y espera
   a que el deployment termine, fallando el job si el build falla.

`workflow_dispatch` permite lanzar `all | backend | frontend` a mano.

### Secrets requeridos en GitHub

Repo → Settings → Secrets and variables → Actions:

| Secret                   | Valor                                          |
| ------------------------ | ---------------------------------------------- |
| `COOLIFY_URL`            | `https://coolify.marcostorresalarcon.com`      |
| `COOLIFY_TOKEN`          | API token de Coolify (`<id>|<secreto>`)        |
| `COOLIFY_BACKEND_UUID`   | `rnpftccijri2129swfvt5y0l`                     |
| `COOLIFY_FRONTEND_UUID`  | `lt1sd98ttf38pbd9oi3jmagm`                     |

Con el CLI de GitHub:

```bash
gh secret set COOLIFY_URL --body "https://coolify.marcostorresalarcon.com"
gh secret set COOLIFY_TOKEN --body "<token>"
gh secret set COOLIFY_BACKEND_UUID --body "rnpftccijri2129swfvt5y0l"
gh secret set COOLIFY_FRONTEND_UUID --body "lt1sd98ttf38pbd9oi3jmagm"
```

Los jobs usan el environment `production`; si tiene reglas de aprobación, el
despliegue queda en espera hasta que se apruebe.

## Despliegue manual

```bash
npm run deploy               # ambas
npm run deploy:backend
npm run deploy:frontend
node scripts/deploy.js all --force      # ignora la caché de Docker
node scripts/deploy.js backend --no-wait
```

## Variables que incrusta el build del frontend

`frontend/scripts/set-env.js` reescribe `src/environments/environment.prod.ts`
en cada build a partir de `BACKEND_URL`, `SITE_URL` y `WHATSAPP_NUMBER`. En
Coolify están marcadas como build-time, así que **cambiarlas exige un
redespliegue**, no basta con reiniciar el contenedor.

`NG_ALLOWED_HOSTS` sí es de runtime: amplía la lista de hosts permitidos de
`angular.json` (`build.options.security.allowedHosts`). Angular valida tanto la
cabecera `Host` como `X-Forwarded-Host`; Traefik reenvía ambas con el dominio
público, por eso el SSR no degrada a render de cliente.
