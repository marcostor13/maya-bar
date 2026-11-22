# HU39 — Inputs sin zoom, puntos de corte únicos y Configuración navegable

## Historia

**Como** usuario de Maya en el móvil o la tablet,
**quiero** que tocar un campo no haga zoom, que la tablet no muestre el diseño a medias y que Configuración tenga un índice,
**para** no luchar con la interfaz.

## Contexto (estado actual)

- **Inputs por debajo de 16 px** que ganan a la regla global (`styles.scss:377`) por especificidad:
  - `leads.ts:717` (13.5 px).
  - `customers.ts:971` (13 px), `:1072` (12 px) y `:1139` (13 px).
  - `forms.ts:644`, `:660` y `:687` (13 px).
  - `campaign-editor.ts:554` (12 px), `recovery/plan-step.ts:321` (13 px).
  - De eventos, ya incluidos en HU30/HU31: check-in a 15 px y asistentes a 14 px.
- **Puntos de corte que no coinciden.**
  - El shell pasa a móvil en 968 px, pero las páginas bajan su padding en 768 px. Entre 769 y 968 px hay barra inferior con `padding: 32px 40px`.
  - Hay además cortes sueltos en 1280/1100/1024/900/720/700/640/600/520.
- **Configuración** (`settings/settings.ts:30-58`):
  - Son 9 tarjetas en una sola columna, sin índice; en el móvil hay que desplazarse mucho para llegar a SMS o Resend.
  - Usa `max-width: 900px` (l.165), contra la regla de CLAUDE.md.

## Propuesta

1. **Inputs**: quitar el `font-size` local o ponerlo en 16 px por debajo de 768 px en esos archivos, y añadir una prueba (o un script de lint) que detecte inputs con `font-size` menor de 16 px en `@media (max-width: 768px)`.
2. **Puntos de corte**: 968 (shell), 768 y 480, documentados en `docs/kitui.md`; padding de página reducido desde 968 px, con una regla común en `styles.scss`.
3. **Configuración**: índice de secciones arriba (chips con anclas, fijos al desplazar en el móvil) y quitar `max-width`.

## Fuera de alcance

- **Modo oscuro**. Hay 578 colores hex y no existe `prefers-color-scheme`; necesita su propia historia si se quiere.

## Criterios de aceptación (borrador)

- C1: a 375 px, ningún `input`, `select` o `textarea` de las páginas citadas mide menos de 16 px.
- C2: entre 769 y 968 px, las páginas usan el padding de móvil.
- C3: desde Configuración en el móvil se llega a cualquier sección en un toque.
