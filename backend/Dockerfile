FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
# Coolify inyecta `ARG NODE_ENV=production` en la etapa: sin `--include=dev`
# npm ci omite las devDependencies y el build de Nest falla.
RUN npm ci --include=dev
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main"]
