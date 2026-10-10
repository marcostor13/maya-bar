---
name: maya-test-backend
description: Receta para escribir o arreglar pruebas unitarias del backend NestJS de Maya CRM (Jest, mocks de modelos Mongoose, qué casos cubrir y cómo evitar pruebas frágiles). Úsala al añadir un .spec.ts en backend/src o cuando una prueba del backend falla.
---

# Pruebas unitarias del backend — Maya CRM

Referencia viva: `backend/src/lists/lists.service.spec.ts` (servicio con modelos)
y `backend/src/shared/http-exception.filter.spec.ts` (clase sin dependencias).
Lee la que se parezca a lo tuyo antes de escribir.

## Dónde y cómo

- El spec vive junto al archivo: `x.service.ts` → `x.service.spec.ts`.
- Jest + ts-jest, `testEnvironment: node`. Globals de Jest (`jest.fn()`), no Vitest.
- Sin base de datos: los modelos son mocks. Lo que necesita Mongo de verdad va
  en una prueba e2e (skill `maya-e2e`).

## Montaje

Servicio con inyección:

```ts
const module = await Test.createTestingModule({
  providers: [
    XService,
    { provide: getModelToken(X.name), useValue: xModel },
    { provide: OtroService, useValue: { metodo: jest.fn() } },
  ],
}).compile();
service = module.get(XService);
```

Con pocas dependencias es más corto instanciar: `new XService(model as never, dep as never)`.

Mock de modelo: una `jest.fn()` (para `new this.model(...)`) con los estáticos
que use el servicio. Las consultas encadenadas devuelven un objeto que se
devuelve a sí mismo y termina en `exec`:

```ts
const query = (result: unknown) => {
  const q: Record<string, jest.Mock> = {};
  for (const m of ['sort', 'lean', 'select', 'populate', 'limit', 'skip'])
    q[m] = jest.fn().mockReturnValue(q);
  q.exec = jest.fn().mockResolvedValue(result);
  return q;
};
```

Mira qué cadena usa el servicio real (`.lean()` sin `.exec()`, `await` directo…)
y haz el mock *thenable* si hace falta (`q.then = (r) => r(result)`).

## Qué cubrir, en este orden

1. **Multitenancy**: cada consulta lleva `tenantId` (como `ObjectId`) en el
   filtro. Compruébalo con `expect(model.find).toHaveBeenCalledWith(expect.objectContaining({ tenantId: tenantOid }))`.
   Un documento de otra empresa → `NotFoundException`, no datos.
2. **Permisos**: rol con alcance propio (`MARKETING`, `IMPULSADOR`) solo ve lo
   suyo; rol no permitido → `ForbiddenException`.
3. **Camino feliz** de cada método público, comprobando lo que se guarda, no
   solo que "no lanza".
4. **Bordes reales**: entrada vacía, duplicado (error `11000` → `ConflictException`),
   id inexistente, proveedor externo caído.
5. **Envíos** (email/SMS/WhatsApp): que respeten la lista de no contactar y que
   nunca salga una petición real — `fetch`, SDKs y `MailService` siempre mockeados.

## Lo que hace una prueba mala

- Afirmar solo `toBeDefined()` o que un mock fue llamado sin mirar con qué.
- Probar el mock en vez del código (el mock devuelve X, la prueba espera X).
- `setTimeout` fijo para esperar algo asíncrono: sondea la condición
  (`until(() => mock.mock.calls.length >= 2)`) o usa `jest.useFakeTimers()`.
  Una espera fija pasa sola y falla con la suite entera en paralelo.
- Depender de `process.env` real o de la hora actual sin fijarla. Si tocas
  `process.env`, restáuralo en `afterEach`.
- Tocar `@Cron`/`onModuleInit` sin llamarlos a mano: en unitarias no corren solos.

## Tipos y lint

`npx eslint "src/**/*.ts"` también revisa los specs. Para el acceso a mocks usa
`as never` / `as unknown as T` al construir, y tipa lo que leas de
`mock.calls`. No añadas `eslint-disable` de archivo entero.

## Verificar

```bash
cd backend
npm test -- <ruta-o-nombre>     # el spec que tocaste
npm test                        # todo, antes de dar por terminado
npx eslint "src/**/*.ts" --max-warnings=100
npm run build                   # no `tsc --noEmit`: TS1272 solo aparece al emitir
```

Si falla, el error completo va primero; no relajes la aserción para que pase
sin entender por qué fallaba. Si la prueba destapa un fallo del código, se
arregla el código.
