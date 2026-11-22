# HU38 — Gestos en la bandeja y gráficos táctiles · Plan técnico

## Diseño

- Directiva `appLongPress`, reutilizable.
- En la bandeja, mantener pulsado un mensaje abre una hoja con Responder y Copiar texto. El botón de responder también es más grande en pantallas táctiles.
- Pestañas de canal desplazables, de 40 px de alto y con el texto recortado.
- Gráficos: el valor se fija al tocar y se cierra al tocar fuera.
- Los botones de periodo del dashboard miden al menos 40 px.

## Riesgos

- Cambios sobre todo de CSS: se verifican con el build y la suite completa.

## Pruebas

- Ver criterios en `cierre.md`.
