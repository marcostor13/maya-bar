---
name: maya-test-frontend
description: Receta para escribir o arreglar pruebas unitarias del frontend Angular de Maya CRM (Vitest con TestBed, HttpTestingController, signals, servicios Toast/Confirm simulados). Úsala al añadir un .spec.ts en frontend/src o cuando una prueba del frontend falla.
---

# Pruebas unitarias del frontend — Maya CRM

Referencia viva: `frontend/src/app/pages/leads/leads.spec.ts` (componente con
HTTP), `frontend/src/app/core/api/campaigns-api.service.spec.ts` (servicio de
API) y `frontend/src/app/shared/csv.spec.ts` (función pura).

## Dónde y cómo

- El spec vive junto al archivo: `leads.ts` → `leads.spec.ts`.
- Runner: `@angular/build:unit-test` con **Vitest**. Globals `describe/it/expect/vi`
  (no `jest`, no `jasmine`): `vi.fn()`, `vi.spyOn()`, `vi.useFakeTimers()`.
- Solo se recogen `src/**/*.spec.ts`. Las de navegador son `e2e/*.e2e.ts` y
  las corre Playwright (skill `maya-e2e`).

## Montaje de un componente

```ts
await TestBed.configureTestingModule({
  imports: [MiComponent],                       // standalone
  providers: [
    provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
    { provide: AuthService, useValue: { currentUser: signal({ id: 'u1', role: 'TENANT_ADMIN' }) } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    { provide: ConfirmService, useValue: { confirm: vi.fn().mockResolvedValue(true) } },
  ],
}).compileComponents();
http = TestBed.inject(HttpTestingController);
fixture = TestBed.createComponent(MiComponent);
fixture.detectChanges();                        // dispara ngOnInit y sus peticiones
http.expectOne((r) => r.url.endsWith('/leads/stages')).flush([...]);
fixture.detectChanges();
```

- Responde **todas** las peticiones del arranque en el orden en que salen y
  cierra con `afterEach(() => http.verify())`: una petición inesperada es un fallo.
- Empareja por `r.url.endsWith(...)`/`includes(...)`, no por URL completa:
  `environment.apiUrl` cambia entre entornos.
- Tras `flush` o cambiar un signal, `fixture.detectChanges()` antes de leer el DOM.

## Qué cubrir

1. **El contrato HTTP**: verbo, ruta y cuerpo exactos (`req.request.method`,
   `req.request.body`). El backend recorta los campos que el DTO no declara, así
   que un nombre de campo mal escrito falla en silencio: la prueba lo atrapa.
2. **Feedback obligatorio**: éxito → `toast.success`; error → `toast.error` con
   el mensaje del servidor (`err.error.message`). Nunca solo `formError`.
3. **Confirmaciones**: lo destructivo pasa por `ConfirmService`; con
   `confirm` resolviendo `false` no sale ninguna petición.
4. **Permisos en pantalla**: lo que un rol no puede hacer no se pinta o queda
   deshabilitado (cambia el `role` del `AuthService` simulado).
5. **Estados**: cargando, vacío y error se ven distintos.
6. Lógica pura (formateo, filtros, validaciones): sácala a una función y
   pruébala sin TestBed.

## Guards, interceptores y servicios

- Guard funcional: `TestBed.runInInjectionContext(() => miGuard(route, state))`
  con `Router` real (`provideRouter([])`) y `vi.spyOn(router, 'navigate')`.
- Interceptor: `provideHttpClient(withInterceptors([miInterceptor]))` y una
  petición real contra `HttpTestingController`.
- `localStorage`: límpialo en `beforeEach`; recuerda que en SSR no existe.

## Lo que hace una prueba mala

- Leer estado interno privado en vez de lo que el usuario ve o lo que sale por HTTP.
- Dejar peticiones sin responder y quitar `http.verify()` para que pase.
- `setTimeout` reales: usa `vi.useFakeTimers()` + `vi.advanceTimersByTime()`.
- Snapshots del HTML entero: se rompen con cualquier cambio de estilo.

## Verificar

```bash
cd frontend
npx ng test --watch=false --include="**/<archivo>.spec.ts"
npx ng test --watch=false        # todo
npm run build                    # el build de producción atrapa errores de plantilla
```
