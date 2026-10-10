---
name: maya-verify
description: Puerta de calidad de Maya CRM - el orden y los comandos exactos para comprobar que toda la plataforma funciona (lint, build, unitarias, e2e de API y de navegador) y cómo leer cada fallo. Úsala antes de dar un trabajo por terminado, antes de un commit o deploy, o cuando pidan "que pase todo".
---

# Verificar la plataforma — Maya CRM

Un solo comando desde la raíz, que se detiene en el primer fallo:

```bash
npm run verify
```

Equivale, en este orden (de lo más rápido y barato a lo más lento):

| # | Qué | Comando | Tarda |
|---|---|---|---|
| 1 | Lint backend | `cd backend && npx eslint "src/**/*.ts" --max-warnings=100` | ~1 min |
| 2 | Build backend | `cd backend && npm run build` | ~30 s |
| 3 | Unitarias backend | `cd backend && npm test` | ~1 min |
| 4 | e2e de API | `cd backend && npm run test:e2e` | ~1 min |
| 5 | Unitarias frontend | `cd frontend && npx ng test --watch=false` | ~2 min |
| 6 | Build frontend | `cd frontend && npm run build` | ~1 min |
| 7 | e2e de navegador | `cd frontend && npm run e2e` | ~4 min |

Atajos: `npm test` (3 + 5), `npm run test:e2e` (4 + 7).

Tocaste solo una parte: corre sus pasos mientras trabajas, pero `npm run verify`
completo antes de decir que está terminado. Un cambio de DTO en el backend
rompe el frontend sin que ninguna unitaria del backend lo note; eso lo ven 6 y 7.

## Cómo leer un fallo

- **Lint/build**: el error dice archivo y línea. `npm run build` y no
  `tsc --noEmit`: TS1272 (tipo importado sin `import type` en un decorador) solo
  sale al emitir.
- **Unitaria**: repítela sola (`npm test -- <nombre>`). Si sola pasa y en grupo
  no, es una espera fija o estado compartido en la prueba — arregla la prueba
  (skill `maya-test-backend` / `maya-test-frontend`), no la repitas hasta que salga.
- **e2e de API**: status inesperado. 401 = guard/token; 403 = `ModuleGuard` o
  `assertRole`; 400 = DTO (¿el campo está declarado?); 500 = excepción sin
  controlar, el stack sale en el log de Nest.
- **e2e de navegador**: `test-results/` guarda captura y traza. Mira primero si
  `watchForFailures` reportó un 5xx: suele ser el backend, no la pantalla.
- **Puerto ocupado** (`:3100`/`:4300`): quedó una corrida anterior colgada;
  ciérrala. No cambies los e2e a los puertos de desarrollo.
- **Primera corrida lenta**: `mongodb-memory-server` descarga el binario de
  Mongo (~780 MB) una vez por máquina; Playwright necesita `npx playwright install chromium`.

## Reglas

- "Pasa" es la salida del comando, no una suposición. Reporta los números
  (suites y pruebas) y, si algo falla, el error completo antes de tocar nada.
- No se da por bueno con una prueba en `.skip`/`.only`, una aserción relajada o
  un paso sin correr. Si un paso no se pudo ejecutar, se dice.
- Para una revisión independiente de la calidad de las pruebas (no solo de si
  pasan), lanza el agente `test-auditor`.
