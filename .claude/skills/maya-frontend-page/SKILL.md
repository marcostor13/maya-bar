---
name: maya-frontend-page
description: Receta para crear o ampliar una página o componente Angular de Maya CRM (standalone, signals, design system kitui, toast/confirm, rutas, menú y permisos). Úsala antes de tocar frontend/src/app.
---

# Página de frontend — Maya CRM

Lee antes: `docs/kitui.md` y la página de referencia que toque.

| Necesitas                       | Copia el patrón de                                         |
| ------------------------------- | ---------------------------------------------------------- |
| Listado + modal simple          | `pages/suppression/suppression.ts` (la más limpia)         |
| Drawer lateral (form > 5 campos)| `pages/lists/lists.ts`, `pages/menu/menu.ts`               |
| Modal reutilizable input/output | `pages/leads/lead-assign.ts`                               |
| Servicio de API                 | `core/api/roles-api.service.ts`                            |
| Gráficos                        | `shared/charts.ts` (uso en `pages/dashboard/dashboard.ts`) |
| Selección múltiple en tabla     | `pages/customers/customers.ts` (`selectedIds`)             |

## Esqueleto

- Componente **standalone**, `template` y `styles` en línea, `inject()`,
  `signal`/`computed`, control de flujo `@if`/`@for` (con `track`).
- Llamadas HTTP en `core/api/<modulo>-api.service.ts`
  (`@Injectable({ providedIn: 'root' })`, `base = environment.apiUrl`,
  métodos tipados que devuelven `Observable`). Las interfaces del modelo se
  exportan desde ese mismo archivo.
- Raíz: `<div class="page animate-fade-in">` con
  `.page { width: 100%; box-sizing: border-box; padding: 32px 40px; }`.
  **Nunca `max-width`** en páginas dentro del shell.

## Reglas de UI (de `CLAUDE.md`, obligatorias)

- Colores, radios y sombras **solo** con variables de `styles.scss`. Nada hardcodeado.
- Clases base: `.btn` + `.btn-primary|secondary|danger|ghost`, `.btn-sm` en
  tablas, `.btn-lg` en CTAs, `.btn-icon`; `.input`, `.select`, `.textarea`;
  `.card`; `.badge-*`; `.table-wrap`.
- Íconos: `lucide-angular` (`<lucide-icon [img]="Icon" />`). Ni emojis ni caracteres.
- Feedback: **siempre** `ToastService` (`shared/toast`) en éxito y error.
  `formError` es solo un complemento dentro del formulario.
- Confirmaciones: **siempre** `ConfirmService` (`shared/confirm`). Nunca `confirm()`.
- Overlay: `position: fixed; inset: 0;` **sin padding**; card
  `width: calc(100% - 48px); max-width: 480px; padding: 28px 32px;`.
- Drawers y modales: cierran con ESC, `aria-label` en botones de ícono,
  autofocus en el primer campo, `--transition-spring`.
- Móvil: tablas dentro de `.table-wrap`; nada de `overflow-x: hidden` en
  contenedores de página (rompe el scroll; usa `clip`).
- **No pongas un backtick dentro de `styles`** ni en comentarios del template:
  rompe el build de Android (ver memoria `android-capacitor-build`).

## Ruta, menú y permisos

1. `app.routes.ts`: hijo de `ShellComponent` con `loadComponent` y
   `canActivate: [moduleGuard('<clave>')]`. Una subpágina reutiliza la clave
   del módulo padre (`recuperacion` usa `campaigns`).
2. `layout/shell/shell.ts`: entrada `NavItem { key, label, icon, route, module? }`.
   Si la clave de permiso no coincide con `key`, usa `module`.
3. Dentro de la página: `PermissionsService.canAct('<clave>', 'create'|'edit'|'delete')`
   para ocultar acciones que el backend rechazaría.
4. No enlaces a rutas que no existan en `app.routes.ts`.

## HTML que viene del usuario

Una plantilla de email es HTML arbitrario: se previsualiza **dentro de un
`<iframe sandbox>` con `srcdoc`**, nunca con `[innerHTML]` en el documento de
la app.

## Verificación (obligatoria)

```bash
cd frontend && npm run build
cd frontend && npx ng test --watch=false --include="**/<archivo>.spec.ts"   # si hay spec
```

Si un paso falla: para y muestra el error completo.
