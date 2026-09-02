# ---------------------------------------------------------------------------
# Frontend Angular con SSR. La imagen final ejecuta el servidor Express que
# genera `@angular/build` (dist/frontend/server/server.mjs), no un nginx
# estático: la landing se sirve prerenderizada desde ahí.
#
# BACKEND_URL / SITE_URL / WHATSAPP_NUMBER son build args porque `set-env.js`
# los incrusta en el bundle en tiempo de compilación; cambiarlos exige rebuild.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

ARG BACKEND_URL=https://api.mayacrm.site
ARG SITE_URL=https://mayacrm.site
ARG WHATSAPP_NUMBER=51975760418
ENV BACKEND_URL=$BACKEND_URL SITE_URL=$SITE_URL WHATSAPP_NUMBER=$WHATSAPP_NUMBER

COPY package*.json ./
# Coolify inyecta `ARG NODE_ENV=production` en cada etapa, y con NODE_ENV=production
# `npm ci` se salta las devDependencies (donde vive @angular/cli). `--include=dev`
# lo fuerza; sin esto el build falla con "could not determine executable to run".
RUN npm ci --include=dev
COPY . .
RUN node scripts/set-env.js && npx ng build --configuration production

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production PORT=4000
# curl: lo usa el healthcheck que genera Coolify (la imagen alpine no lo trae).
RUN apk add --no-cache curl
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
EXPOSE 4000

# Healthcheck propio: la imagen alpine no trae curl y el wget de busybox resuelve
# `localhost` a ::1, donde el servidor (que escucha en 0.0.0.0) no responde. Con
# HEALTHCHECK definido aquí, Coolify respeta este en vez de generar el suyo.
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6   CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/frontend/server/server.mjs"]
