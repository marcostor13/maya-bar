---
name: maya-backend-module
description: Receta para crear o ampliar un módulo NestJS del backend de Maya CRM (esquema, DTO, servicio, controlador, registro y pruebas) respetando multitenancy y permisos. Úsala antes de tocar backend/src.
---

# Módulo de backend — Maya CRM

Referencia viva: `backend/src/lists` (pequeño y completo). Léelo antes de escribir.

## Archivos

```
backend/src/<modulo>/
  <entidad>.schema.ts      @Schema({ timestamps: true }) + índices al final
  dto/<modulo>.dto.ts      class-validator; update con PartialType (@nestjs/mapped-types)
  <modulo>.service.ts
  <modulo>.controller.ts
  <modulo>.module.ts
  <modulo>.service.spec.ts
```

## Reglas que no se negocian

1. **Tenant siempre desde el JWT.** `req.user` es `AuthReq` (`auth/permissions.ts`):
   `{ userId, email, role, tenantId, localIds }`. El controlador pasa
   `req.user.tenantId` al servicio y el servicio filtra **toda** consulta con
   `tenantId: new Types.ObjectId(tenantId)`. Nunca se acepta `tenantId` del body
   ni de la query. Un `findById` va seguido de la comprobación de tenant o se
   sustituye por `findOne({ _id, tenantId })`.
2. **Guards.** Clase: `@UseGuards(JwtAuthGuard, ModuleGuard('<clave>'))`.
   Primera línea de cada handler: `assertRole(req.user.role, CRM_ROLES)`
   (o `MANAGE_ROLES` para configuración). `ModuleGuard` deduce la acción del
   verbo HTTP: POST=create, PATCH/PUT=edit, DELETE=delete, GET libre.
3. **Claves de módulo.** No añadas claves a `ALL_MODULES`
   (`roles/modules.catalog.ts`) salvo que el plan lo pida: los roles ya
   guardados no las reciben solos. Lo de campañas, plantillas, SMS y links usa
   `campaigns`; lo del contacto usa `customers`.
4. **Endpoints públicos** (redirecciones, webhooks, bajas) van en un
   controlador aparte **sin** guards, y nunca devuelven datos de otro tenant.
5. **DTO.** El `ValidationPipe` global es `{ whitelist: true, transform: true }`:
   una propiedad sin decorador se descarta en silencio. Todo campo lleva
   decorador, incluidos los opcionales (`@IsOptional()`).
6. **Errores** con excepciones de Nest y mensaje en español
   (`NotFoundException('Plantilla no encontrada')`).
7. **Secretos** (tokens de proveedores) cifrados con `shared/secret-box.ts` y
   jamás devueltos en claro: se responde `hasSecret: true`.
8. **Ids de entrada**: valida con `Types.ObjectId.isValid` antes de convertir.
9. **Usuarios referenciados**: si el esquema guarda un `userId`, añádelo a
   `users/user-references.ts` para que borrar un usuario no deje huérfanos.
10. **Trabajo en segundo plano**: `@Cron` de `@nestjs/schedule` con bloqueo
    atómico en Mongo (`findOneAndUpdate` sobre `lockedUntil`), como
    `recovery.service.ts` `tick()`. Nada de colas en memoria: se pierden al
    reiniciar.

## Registro

- `MongooseModule.forFeature([...])` con los esquemas propios y los ajenos que
  el servicio inyecte.
- Importa el módulo en `backend/src/app.module.ts`.
- Exporta el servicio si otro módulo lo consume.

## Pruebas

`Test.createTestingModule` con `getModelToken(X.name)` apuntando a mocks de
jest (constructor `jest.fn()` y `find/findOne/...` devolviendo
`{ sort, lean, exec }` encadenables). Mira `lists.service.spec.ts`. Cubre como
mínimo: aislamiento por tenant, validaciones y el camino feliz.

## Verificación (obligatoria antes de dar algo por hecho)

```bash
cd backend && npm run build          # no uses tsc --noEmit: TS1272 solo aparece al emitir
cd backend && npm test -- <modulo>   # las pruebas del módulo
cd backend && npx eslint "src/<modulo>/**/*.ts"
```

Si un paso falla: para, muestra el error completo y no intentes arreglarlo a
ciegas (regla de `CLAUDE.md`).
