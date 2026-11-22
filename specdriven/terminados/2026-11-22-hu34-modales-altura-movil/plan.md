# HU34 — Plan técnico

- Script que recorre `frontend/src` (sin specs) y, tras cada declaración de altura en `vh` sin su par `dvh`, añade la versión `dvh`. Es idempotente.
- `.modal-card` en `styles.scss`, antes del bloque de tablas. Las páginas que ya tienen su `.modal-card` local conservan su ancho, padding y radio, porque el estilo del componente gana en especificidad.
- **Riesgo**: algún navegador sin `dvh`. Mitigación: se mantiene primero el valor en `vh`.
- **Pruebas**: build y la suite completa (es un cambio solo de CSS); comprobación con grep.
