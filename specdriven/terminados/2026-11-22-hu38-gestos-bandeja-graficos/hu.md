# HU38 — Toques y gestos en Conversaciones y en los gráficos

## Historia

**Como** operador que atiende desde el móvil,
**quiero** responder o copiar un mensaje con una pulsación larga, filtrar por canal sin fallar el toque y ver el valor de un gráfico al tocarlo,
**para** trabajar con el dedo igual de rápido que con el ratón.

## Contexto (estado actual)

- **Responder un mensaje** solo se puede con `.reply-btn` de 26 × 26, a opacidad 0.55 en táctil (`inbox/inbox.ts:1879-1892`).
  - No hay pulsación larga ni deslizar.
  - No hay forma de copiar el texto.
- **Pestañas de canal** (`.channel-tab`, inbox.ts:1436-1440): unos 28 px de alto, texto de 12.5 px y `nowrap` sin recorte; con 4 o más canales en 360 px el texto se sale.
  - La cabecera apila título, Chats/Correos, búsqueda, canales y cuenta (l.250-330) y quita mucho espacio a la lista.
- **Gráficos**: el tooltip solo responde a `pointermove`/`pointerleave` (`shared/charts.ts:192`, `touch-action: pan-y` en l.246); un toque no muestra el valor.
- **Dashboard**: los botones de periodo `.seg button` miden unos 33 px (`dashboard.ts:311, 415`).

## Propuesta

1. **Pulsación larga** (unos 450 ms, cancelable al desplazar) sobre una burbuja.
   - Abre una hoja inferior con Responder y Copiar, con botones ≥ 44 px.
   - En escritorio sigue el botón actual.
2. **Pestañas de canal** de ≥ 40 px de alto, con scroll horizontal y recorte con puntos suspensivos.
   - En el móvil, canal y cuenta se pliegan en el botón "Filtros" (`inbox-filters`).
3. **Gráficos**: un toque (`pointerdown`/`click`) fija el tooltip en el punto tocado y un toque fuera lo cierra.
4. **Botones de periodo** del dashboard ≥ 40 px.

## Criterios de aceptación (borrador)

- C1: una pulsación larga sobre un mensaje en táctil abre Responder/Copiar; desplazar la lista no la dispara.
- C2: a 360 px, con 5 canales, las pestañas no se desbordan y miden ≥ 40 px.
- C3: tocar un punto de un gráfico muestra su valor.
