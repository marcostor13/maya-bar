Rules: Read files first. Write complete solution. Test once. No over-engineering. Keep responses terse. Stop immediately and report the full error with traceback before attempting any fix if a step fails. No sycophancy. Only provide the code, fix, or required response.

## UI & Design Guidelines (BAR / Maya Platform)

### Estética
- App Móvil B2C/B2B2C Premium. Muy limpia y apetitosa.
- Abundante aire visual (padding de 24px en tarjetas). Bordes extremos (radius-pill 9999px para botones, radius-lg 24px). Sombras difusas y amplias (--shadow-lg).
- Botones y Formularios: .btn por defecto (14px). Usar .btn-sm en tablas/cards, .btn-lg para CTAs, .btn-icon para íconos. Para formularios usar SIEMPRE las clases .input, .select, .textarea (diseño pill-shaped unificado).
- Íconos: Siempre usar `lucide-angular` (lucide-icon). No usar caracteres de texto ni emojis para la UI.
- Referencia: docs/kitui.md — design system completo con variables, clases y patrones actualizados.

### CSS
- SIEMPRE usar variables de styles.scss. No hardcodear colores.
- Layout de páginas: `width: 100%; box-sizing: border-box; padding: 32px 40px;` — NUNCA `max-width` en páginas dentro del shell.
- Clases base obligatorias: `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-ghost`, `.input`, `.card`, `.badge-*`, `.table-wrap`.
- Tipografía: Poppins (`--font-heading`) para H1/títulos. Inter (`--font-base`) para UI.
- Animaciones: `.animate-fade-in` en page entry, `--transition-spring` para drawers/modales.

### Modales / Overlays
- El `.overlay` backdrop NUNCA lleva `padding` exterior — cubre la pantalla completa.
  ```css
  .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45);
    backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 100; }
  ```
- La card del modal: `width: calc(100% - 48px); max-width: 480px; padding: 28px 32px;`

### Notificaciones y confirmaciones — OBLIGATORIO
- SIEMPRE usar `ToastService` para feedback de operaciones (éxito y error). NUNCA mostrar solo `formError` sin toast.
  ```typescript
  private toast = inject(ToastService); // src/app/shared/toast
  this.toast.success('Guardado correctamente');
  this.toast.error(err.error?.message || 'Error al guardar');
  ```
- NUNCA usar `window.confirm()` o `confirm()` nativo. SIEMPRE usar `ConfirmService`.
  ```typescript
  private confirm = inject(ConfirmService); // src/app/shared/confirm
  const ok = await this.confirm.confirm({ title: '...', message: '...', confirmText: 'Eliminar', danger: true });
  if (!ok) return;
  ```

### Shared components (ya registrados en app.ts root)
- `<app-progress-bar>` — barra de carga automática vía `loadingInterceptor`
- `<app-toast>` — notificaciones bottom-right
- `<app-confirm>` — diálogo de confirmación Promise-based

### Patrones de formularios
- Drawers (panel lateral) para formularios complejos — ver menu.ts como referencia.
- Modales centrados para formularios simples (≤5 campos) — ver tenants.ts / locals.ts.
- `formError` signal solo para mostrar error inline dentro del form. El toast va siempre además.

### Routing
- Páginas protegidas van dentro del Shell (`app.routes.ts`).
- SUPERADMIN: redirige a `/admin/tenants`. Otros roles: redirigen a `/dashboard`.
- No crear links a rutas que no existen en `app.routes.ts`.
