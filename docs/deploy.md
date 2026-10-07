# Despliegue — Coolify + Cloudflare + GitHub Actions

Monorepo con dos aplicaciones desplegadas en la misma instancia de Coolify
(`52.1.145.159`), cada una desde su propio `Dockerfile`:

| App        | Ruta        | Dominio                | Puerto | UUID en Coolify            |
| ---------- | ----------- | ---------------------- | ------ | -------------------------- |
| Backend    | `backend/`  | `api.mayacrm.site`     | 3080   | `kagzavwdhejydx3rvqkaxbxz` |
| Frontend   | `frontend/` | `mayacrm.site` (+`www`)| 4000   | `szjvobvulcvabtmqw1vn2jyc` |

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

Los secretos del backend (Mongo, JWT, claves de terceros, VAPID, Firebase…)
salen de `backend/.env`: `provision` sube como variables solo-runtime todo lo
que haya ahí, salvo lo vacío, lo que apunta a `localhost` y lo que ya deriva de
los dominios (`PORT`, `NODE_ENV`, `FRONTEND_URL`, `PUBLIC_API_URL`,
`CORS_ORIGINS`). Coolify no es la fuente de verdad: un secreto que solo exista
en su panel se pierde si se pierde la instancia.

Si `COOLIFY_GITHUB_APP_UUID` está vacío, las apps se crean clonando el
repositorio como público (HTTPS sin credenciales). Es el caso de la instancia
actual; si el repo pasa a privado hay que instalar una GitHub App en Coolify y
recrear el origen de las apps.

### Dominios cortos (links con seguimiento)

Un dominio propio para links cortos (`ir.empresa.com/abc1234`) lo sirve el
backend, no el frontend. Para activarlo:

1. Registro **A** del dominio hacia `SERVER_IP`, sin proxy.
2. Añadirlo a `SHORT_LINK_DOMAINS` en el `.env` de la raíz (varios separados
   por comas) y ejecutar `npm run provision` y `npm run deploy:backend`:
   `provision` lo añade a los dominios de la app del backend para que Traefik
   lo enrute y le emita certificado.
3. En la plataforma, **Links → Dominios → Verificar**. Pasa a *Activo* cuando
   `https://<dominio>/__maya-ping` responde.

Quitar un dominio de `SHORT_LINK_DOMAINS` deja de servirlo en el siguiente
`provision`: sus links dejan de abrir.

La geolocalización de los clics es opcional: `GEOIP_URL` en `backend/.env`
(por ejemplo `https://ipwho.is/{ip}`). Sin ella no se envía ninguna IP a
terceros y el dashboard simplemente no muestra países.

MongoDB es Atlas y filtra por IP: la IP del servidor (`SERVER_IP`) tiene que
estar en *Network Access* del cluster o el backend arranca pero responde 502.

La lista de no contactar (`docs/no-contactar.md`) no necesita configuración:
crea sus índices sola al arrancar.

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

**Los dos despliegues van en serie, no en paralelo.** Coolify construye ambas
imágenes en el mismo servidor y lanzarlas a la vez lo tumba: el 2026-09-04 los
dos contenedores de build murieron con 100 ms de diferencia (`exit 255`, sin
una sola línea de salida) mientras coincidían dos `npm ci` y un `nest build`.
Por eso `deploy-frontend` declara `needs: deploy-backend` aunque no dependan
entre sí, y usa `!cancelled()` para desplegarse igual si el backend no cambió o
si su despliegue falló — para entonces el servidor ya está libre. El precio es
que un push que toca las dos partes tarda la suma de ambos, no el máximo.

Si un despliegue vuelve a morir con `exit 255` y sin salida del build, el
problema está en el servidor, no en el código: mira memoria libre, `dmesg -T |
grep -i oom` y `docker system df` antes de tocar nada del repositorio.

### Secrets requeridos en GitHub

Repo → Settings → Secrets and variables → Actions:

| Secret                   | Valor                                          |
| ------------------------ | ---------------------------------------------- |
| `COOLIFY_URL`            | `https://coolify.ignia.site`      |
| `COOLIFY_TOKEN`          | API token de Coolify (`<id>|<secreto>`)        |
| `COOLIFY_BACKEND_UUID`   | `kagzavwdhejydx3rvqkaxbxz`                     |
| `COOLIFY_FRONTEND_UUID`  | `szjvobvulcvabtmqw1vn2jyc`                     |

Con el CLI de GitHub:

```bash
gh secret set COOLIFY_URL --body "https://coolify.ignia.site"
gh secret set COOLIFY_TOKEN --body "<token>"
gh secret set COOLIFY_BACKEND_UUID --body "kagzavwdhejydx3rvqkaxbxz"
gh secret set COOLIFY_FRONTEND_UUID --body "szjvobvulcvabtmqw1vn2jyc"
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
