---
name: maya-e2e
description: Cómo escribir y correr las pruebas end-to-end de Maya CRM - e2e de API (Jest + supertest contra la app real y Mongo en memoria) y e2e de navegador (Playwright contra frontend + backend reales). Úsala al añadir un flujo, una ruta o una pantalla, o cuando un e2e falla.
---

# Pruebas e2e — Maya CRM

Dos niveles, los dos contra la aplicación **real** y una Mongo **en memoria**:

| Nivel | Dónde | Corre | Sirve para |
|---|---|---|---|
| API | `backend/test/*.e2e-spec.ts` | `cd backend && npm run test:e2e` | guards, DTO, multitenancy, permisos, flujos entre módulos |
| Navegador | `frontend/e2e/*.e2e.ts` | `cd frontend && npm run e2e` | que la pantalla y la API encajen de verdad |

Desde la raíz: `npm run test:e2e` (los dos) o `npm run verify` (todo).

## Regla que no se rompe: nunca contra datos reales

`backend/.env` apunta a la base y a los proveedores de producción.
`backend/test/support/e2e-env.js` (`isolateEnv`) vacía **todas** las claves de
ese archivo antes de cargar la app y aborta si `MONGODB_URI` no es local. No lo
esquives, no añadas credenciales reales a una prueba y no apuntes un e2e a
`localhost:3000` (el backend de desarrollo, que sí usa el `.env`).

Consecuencia: en e2e no hay Resend, WhatsApp, S3 ni IA. Un flujo que dependa de
un proveedor se prueba hasta la frontera (que la API valide y encole), y el
envío en sí en una unitaria con el proveedor simulado.

## e2e de API

Ayudas en `backend/test/support/app.ts`:

```ts
app = await createApp();                 // AppModule + configureApp, igual que main.ts
const owner = await registerTenant(app); // empresa nueva + sesión TENANT_ADMIN
const mkt = await createUser(app, owner, 'MARKETING');
const root = await login(app, ADMIN.email, ADMIN.password); // SUPERADMIN sembrado
await request(app.getHttpServer()).get('/customers').set(bearer(owner)).expect(200);
```

- Cada archivo arranca con una base vacía y propia; dentro del archivo, cada
  prueba crea lo que necesita (otra empresa con `registerTenant`). No dependas
  del orden ni de lo que dejó otra prueba.
- `app.e2e-spec.ts` recorre **todas** las rutas registradas: las privadas deben
  dar 401 sin token y ningún GET puede dar 5xx. Una ruta pública nueva hay que
  añadirla a `PUBLIC_ROUTES` ahí, a propósito y con su motivo.
- Todo módulo con datos por empresa merece su prueba de aislamiento: la empresa
  B no ve, edita ni borra lo de la A (mira `crm.e2e-spec.ts`).
- Comprueba el efecto, no solo el status: tras un POST, léelo con un GET.
- Lo que se monta en la app (pipes, filtro, CORS, middleware) va en
  `backend/src/app.setup.ts`. Si lo pones en `main.ts`, los e2e no lo ven.

## e2e de navegador

`frontend/playwright.config.ts` levanta solo los dos servidores: el backend
compilado en `:3100` (`backend/test/support/e2e-server.js`) y
`ng serve --configuration e2e` en `:4300` (usa `environment.e2e.ts`). No chocan
con el desarrollo en `:3000`/`:4200`.

Ayudas en `frontend/e2e/support.ts`: `registerByApi(request)` (datos por API,
rápido), `loginByUi(page, email, password)`, `watchForFailures(page)`.

- Prepara los datos por API y prueba por interfaz solo lo que el flujo trata.
- Localiza como lo haría una persona: `getByRole`, `getByPlaceholder`,
  `getByText`. Clases CSS solo si no hay otra cosa (`.toast-message`, `.logout-btn`).
- Sin `waitForTimeout`: las aserciones `expect(...)` ya reintentan.
- `const failures = watchForFailures(page)` al empezar y
  `expect(failures).toEqual([])` al final: atrapa excepciones de JS y respuestas
  5xx que la pantalla disimula con un panel vacío.
- Tras guardar algo, `page.reload()` y comprueba que sigue ahí.
- Una pantalla nueva con entrada en el menú queda cubierta por "todas las
  pantallas del menú abren sin errores"; añade además su flujo principal.
- Los archivos son `*.e2e.ts`, no `*.spec.ts`: así Vitest no los recoge.

Depurar: `npm run e2e:ui`, o `npx playwright test -g "nombre" --headed`. Tras un
fallo, `npx playwright show-trace test-results/<carpeta>/trace.zip`.

## Cuando un e2e falla

Primero decide qué falló: ¿la prueba (selector viejo, dato compartido) o la
plataforma? Un 500, un 401 inesperado o un dato de otra empresa visible es un
fallo de la plataforma: se arregla el código, no la aserción. No marques
`.skip` ni subas un timeout para taparlo.
