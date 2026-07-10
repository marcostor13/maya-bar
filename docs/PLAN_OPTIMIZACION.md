# Plan de Optimización — Buenas Prácticas, SOLID y Tests Unitarios

Basado en un diagnóstico del código al 2026-07-10. Cada fase es independiente y entregable por separado
(una rama/PR por fase). El orden refleja riesgo/beneficio: primero seguridad y validación, luego
refactors SOLID que habilitan los tests, y al final cobertura sostenida con CI.

## Diagnóstico resumido

| Área | Estado actual |
|---|---|
| Validación de inputs (backend) | Sin `ValidationPipe` global; 0 DTOs con `class-validator` — cualquier payload llega crudo a Mongoose |
| Secretos | `JWT_SECRET \|\| 'SECRET'` como fallback en `auth/jwt.strategy.ts` y `instagram/instagram-oauth.service.ts`; password de superadmin hardcodeada y logueada en `users/users.service.ts` |
| Llamadas HTTP externas | 8 servicios hacen `fetch` crudo (Meta Graph, OpenAI) con parsing/manejo de errores duplicado |
| Tests backend | 5 suites / 80 tests (solo `orders` y `reservations`) de ~24 módulos |
| Tests frontend | Specs placeholder autogenerados, sin asserts de lógica |
| Componentes frontend | `invitation-designer` (3086 líneas), `event-detail` (2109), `campaigns` (1574), `settings` (1248); inyectan `HttpClient` directo, duplican export CSV y checks de rol |
| CI | Sin pipeline: lint/test/build no corren en PRs |

---

## Fase 1 — Seguridad y validación (crítico, ~1 día)

1. **Eliminar fallbacks de secretos**: en `jwt.strategy.ts` e `instagram-oauth.service.ts`, si falta
   `JWT_SECRET` la app debe fallar al arrancar (throw en bootstrap), nunca usar `'SECRET'`.
2. **Seed de superadmin**: mover email/password inicial a env (`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`),
   no loguear la contraseña, y saltar el seed si las vars no están definidas.
3. **`ValidationPipe` global** en `main.ts` con `{ whitelist: true, forbidNonWhitelisted: true, transform: true }`.
4. **DTOs con `class-validator`/`class-transformer`** en todos los módulos con escritura, empezando por los
   públicos (registro a eventos, reservas públicas, webhooks) y auth.
5. **CORS**: sacar los orígenes hardcodeados de `main.ts` a una env `CORS_ORIGINS` (lista separada por comas).

## Fase 2 — SOLID backend (~2-3 días)

1. **Cliente HTTP compartido para Meta Graph** (`shared/meta-graph.client.ts`): un solo lugar para base URL,
   versión de API, Bearer token, parseo de `{ error: { message } }` y errores tipados
   (`MetaApiError`). Migrar `instagram.service`, `instagram-oauth.service`, `whatsapp.service`,
   `whatsapp-oauth.service`, `wa-templates.service`. *(DRY + SRP; elimina la clase de bug tipo
   "Unsupported get request" repitiéndose en cada servicio)*
2. **Interfaz para proveedores de IA** (`AI_PROVIDER` token + interfaz): `ai.service`, `embeddings.service`
   y `ai-agents.service` dependen de la abstracción, no de `fetch` a OpenAI. *(DIP; habilita mocks en tests)*
3. **Dividir `events.service.ts` (561 líneas)** por responsabilidad: `events.service` (CRUD),
   `registrations.service` (registro/check-in/QR), `impulsadores.service` (asignación/atribución).
   *(SRP; hoy un cambio en check-in obliga a tocar el servicio de CRUD)*
4. **Manejo de errores uniforme**: filtro global `HttpExceptionFilter` + convención: servicios lanzan
   excepciones Nest tipadas, nunca devuelven `{ success:false }` y excepciones mezclados (hoy conviven
   ambos patrones en `instagram-accounts.service.test()` vs `status()`).
5. **Tipos compartidos**: los `interface` de dominio duplicados entre controladores/servicios se mueven a
   `types/` por módulo.

## Fase 3 — Tests unitarios backend (~3-4 días, en paralelo con Fase 2 por módulo)

Patrón: `Test.createTestingModule` con `getModelToken()` mockeado y `global.fetch` con `jest.spyOn`
(o el `MetaGraphClient` mockeado tras Fase 2). Prioridad por riesgo:

1. `auth` + `users` (login, roles, normalización de emails, seed) — núcleo de seguridad.
2. `events` + `registrations` (capacidad, check-in doble, atribución de impulsador, CSV) — mayor lógica de negocio.
3. `instagram-accounts` + `instagram-oauth` + `whatsapp-accounts` (upsert OAuth, refresh de token,
   ruteo de webhook por IG ID) — regresiones recientes reales.
4. `ai-agents` (webhook de mensajes: verificación de firma, ruteo por cuenta).
5. `campaigns` (segmentación y envío).

**Meta de cobertura**: 70% global backend, 85%+ en los servicios listados. Activar umbral en jest
(`coverageThreshold`) recién al terminar la fase para no bloquear el desarrollo intermedio.

## Fase 4 — SOLID frontend (~3-4 días)

1. **Capa de API services** (`core/api/`): `EventsApiService`, `AccountsApiService`, `CampaignsApiService`,
   etc. Los componentes dejan de inyectar `HttpClient` y de concatenar `${API}/...`. *(SRP/DIP; los
   componentes se vuelven testeables con un mock de servicio)*
2. **Partir componentes gigantes** (mantener el idioma actual: standalone + template inline por componente):
   - `event-detail.ts` → un componente hijo por tab (`event-general-tab`, `event-media-tab`,
     `event-registrations-tab`, `event-checkin-tab`, `event-impulsadores-tab`, `event-stats-tab`).
   - `settings.ts` → un componente por integración (WhatsApp, Instagram).
   - `invitation-designer.ts` → paneles de propiedades y canvas como hijos.
   - `campaigns.ts` → lista + editor.
3. **Utilidades compartidas**: `shared/csv.ts` (hoy `downloadExcel` y `downloadImpulsadoresExcel` duplican
   la lógica de BOM/escape/blob), `shared/roles` (computed `canManage`/`isImpulsador` repetidos en
   `events.ts` y `event-detail.ts`).
4. **Modelos tipados compartidos** (`shared/models/`): `AppEvent`, `Registration`, `IgAccount`, etc. están
   duplicados con variaciones entre páginas.

## Fase 5 — Tests unitarios frontend (~2-3 días)

1. Reemplazar los specs placeholder por tests reales; empezar por servicios: `auth.service`
   (roles, token) y los API services de la Fase 4 con `provideHttpClientTesting`.
2. Lógica pura de componentes vía signals/computed: `impulsadorStats`, `filteredRegistrations`,
   `attendanceRate`, helpers de fecha de `events.ts`, y el flujo del form builder (agregar/editar/ordenar campos).
3. Utilidades compartidas (`csv.ts`) con tests de escape/BOM.

**Meta**: servicios 85%+, componentes nuevos (post-split) con sus computed cubiertos.

## Fase 6 — CI y guardrails (~0.5 día)

1. **GitHub Actions**: workflow en PR y push a `main` con `lint` + `test` + `build` para backend y frontend.
2. Subir el presupuesto de estilos por componente en `angular.json` solo si tras el split de la Fase 4
   sigue habiendo warnings (hoy `event-detail` e `invitation-designer` lo exceden).
3. `npm run lint` limpio como requisito de merge; prettier check en CI.

---

## Orden de ejecución y criterio de done

| Orden | Fase | Done cuando |
|---|---|---|
| 1 | Fase 1 | App no arranca sin secretos; payloads inválidos devuelven 400 con detalle |
| 2 | Fase 2 + 3 | Módulo migrado = módulo con tests verdes; `jest --coverage` ≥ 70% |
| 3 | Fase 4 + 5 | Ningún componente > 800 líneas; componentes sin `HttpClient` directo; specs reales verdes |
| 4 | Fase 6 | PR no mergeable con lint/test/build rojos |

Reglas transversales durante todo el plan:
- Refactor y tests del mismo módulo van juntos en el mismo PR (el test fija el comportamiento antes de mover código).
- Sin big-bang: nunca migrar todos los módulos a la vez; uno por PR.
- Sin sobre-ingeniería: no introducir repositorios genéricos, CQRS ni state management global; solo lo listado.
