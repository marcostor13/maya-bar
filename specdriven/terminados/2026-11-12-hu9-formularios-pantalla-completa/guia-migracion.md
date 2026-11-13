# HU9 — Guía para migrar un panel lateral a `app-form-page`

Componente: `frontend/src/app/shared/form-page.ts` (léelo antes de empezar).
Referencia ya migrada: `frontend/src/app/pages/ai-agents/ai-agents.ts`, editor de agentes.

## Qué cambiar en cada panel (drawer) del alcance

1. **Importar** `FormPageComponent` (y `snapshotOf` si es un formulario) en
   `imports` del componente.
2. **Sustituir el envoltorio** `<div class="overlay" …><aside class="drawer" …>`
   y su cabecera (`drawer-header`, título, botón X) por:
   ```html
   <app-form-page
     [title]="editing ? 'Editar X' : 'Nuevo X'"
     subtitle="(el subtítulo que tenía, si tenía)"
     backLabel="(nombre de la pantalla de origen, p. ej. 'Contactos')"
     [urlKey]="(id del registro) || 'nuevo'"
     [dirty]="isDirty()"
     (closed)="(el método que cerraba el panel)">
     <ng-container formActions>
       (los botones de acción del pie, salvo "Cancelar"/"Cerrar")
     </ng-container>
     (el contenido que estaba dentro de drawer-scroll, tal cual)
   </app-form-page>
   ```
   - Fichas o paneles de solo lectura (detalle de lead, envíos, miembros,
     destinatarios, detalle de lote): igual, pero **sin** `dirty`; `urlKey`
     con el id; las acciones de la cabecera del panel van a `formActions`.
   - Quita los botones "Cancelar"/"Cerrar" del pie: la flecha de volver los
     reemplaza. Si el pie tenía otras acciones (eliminar, guardar), pásalas a
     `formActions`, con el botón principal al final.
   - No cambies campos, validaciones, llamadas HTTP, toasts ni la lógica de
     guardado.
3. **Cambios sin guardar** (solo formularios de crear/editar): guarda una foto
   del formulario al abrirlo y compárala.
   ```ts
   private formSnapshot = '';
   // al final de openNew()/openEdit(), cuando el formulario ya está cargado:
   this.formSnapshot = snapshotOf(this.form);   // o snapshotOf(this.form()) si es signal
   isDirty() { return snapshotOf(this.form) !== this.formSnapshot; }
   ```
   Si el formulario se rellena de forma asíncrona tras abrir (p. ej. carga del
   registro), toma la foto cuando termina de cargar.
4. **ESC**: si la página tiene `@HostListener('document:keydown.escape')`,
   quita la rama que cerraba ese panel (el componente ya lo hace y pregunta si
   hay cambios). Deja las ramas de otros modales: si hay un modal
   (`.overlay`, `[aria-modal]`) o una confirmación abierta, `app-form-page`
   ignora ESC, así que el modal se cierra sin cerrar el formulario.
5. **CSS**: borra las reglas `.overlay`, `.drawer`, `.drawer-header`,
   `.drawer-title-group`, `.drawer-scroll`, `.drawer-actions` y keyframes que
   queden sin uso en ese archivo (no las de modales que sigan usando
   `.overlay`). Si había reglas pensadas para el ancho del drawer (p. ej.
   `.drawer .field-row { flex-direction: column }`), revísalas: ahora hay todo
   el ancho; usa grids de 2 columnas cuando ayude a leer, y una columna en
   ≤ 768 px. Solo variables de `styles.scss`; nunca `max-width` en la página.
6. **Pruebas** (`*.spec.ts` de esa página): si buscaban `.drawer`, `aside`,
   `.drawer-actions` o el botón "Cancelar", cámbialas por
   `app-form-page`, `[role="dialog"]`, `.bar-actions` o la flecha `.back`.
   Las pruebas necesitan `provideRouter([])` si no lo tenían (el componente
   inyecta `Router`/`ActivatedRoute`). Ejecuta las pruebas de esa página.

## Qué NO migrar

- Modales centrados simples (`.modal`, ≤ 5 campos) y diálogos de
  confirmación.
- Playground de agentes, papelera/bloqueados de la bandeja, centro de
  notificaciones, carrito del menú público.

## Cómo probar

```bash
cd frontend
# Solo las pruebas de tu página (el patrón debe terminar en *.spec.ts):
npx ng test frontend --watch=false --include='src/app/pages/<carpeta>/**/*.spec.ts'
# Compilación (detecta errores de plantilla en páginas sin pruebas):
npx tsc -p tsconfig.app.json --noEmit
```
Otras personas migran otras páginas a la vez: no ejecutes la suite completa
ni `npm run build` (comparten carpeta de salida); eso se hace al final.
