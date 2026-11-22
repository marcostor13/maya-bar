# HU31 — Lista de asistentes legible en el móvil · Especificación

Historia: `backlog/hu31-asistentes-movil.md` · Fecha: 2026-11-22 · Estado: aprobada

## Objetivo

En el móvil, cada asistente ocupa unos 9 renglones, no se puede ordenar y no se le puede contactar. Se trata de recorrer muchos registros y contactar a un asistente en un toque.

## Usuarios

- **Encargado / gerente**: revisa y contacta asistentes desde el móvil.

## Alcance

- **Incluye**:
  - Tarjeta compacta que se despliega al tocar.
  - Acciones Llamar, WhatsApp y Copiar email.
  - "Ordenar por" en el móvil.
  - Buscador con `.input`.
  - Colores con variables.
- **Fuera de alcance**:
  - Abrir el chat en Conversaciones (no hay búsqueda de contacto por teléfono desde aquí).
  - La tabla de escritorio, que no cambia.

## Requisitos (EARS)

- **R1** — En pantallas ≤ 768 px, el sistema debe mostrar cada asistente en una tarjeta cerrada de 2 renglones:
  - Nombre y chips (personas, Confirmado/Cancelado, Ingresó).
  - Debajo, impulsador y fecha.
- **R2** — Cuando se toca una tarjeta, el sistema debe desplegar email, teléfono, ticket y respuestas del formulario.
- **R3** — Si el asistente tiene teléfono, el detalle debe ofrecer "Llamar" (`tel:`) y "WhatsApp" (`wa.me` con el número normalizado). El detalle siempre ofrece "Copiar email".
- **R4** — En el móvil, el sistema debe ofrecer "Ordenar por": recientes, antiguos, nombre A-Z, nombre Z-A y más personas.
- **R5** — El buscador debe usar `.input` (16 px en el móvil) y lanzar una sola petición tras 350 ms sin teclear (comportamiento que ya existe).
- **R6 (no funcional)** — Toques ≥ 44 px en la tarjeta y las acciones; colores con variables; la tarjeta es un botón accesible (`aria-expanded`).

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1, R2 | En modo móvil se pinta la lista compacta y, al tocar, aparece el detalle | unitaria (`isMobile` forzado) |
| C2 | R4 | Elegir "Nombre A-Z" recarga con `sortBy=name`, `sortOrder=asc` | unitaria |
| C3 | R3 | Con teléfono `999 123 456` el enlace de WhatsApp es `https://wa.me/51999123456`; sin teléfono no hay Llamar ni WhatsApp | unitaria |
| C4 | R5 | Escribir lanza una sola petición tras 350 ms | unitaria (la que ya existe) |
| C5 | R6 | Revisión CSS: toques ≥ 44 px y colores con variables | revisión |

## Supuestos y decisiones por defecto

- Normalización del teléfono para WhatsApp:
  - Se quitan los símbolos.
  - Un número peruano de 9 dígitos que empieza por 9 recibe el prefijo 51.
  - Uno que empieza por 00 pierde el 00.
  - El resto se usa tal cual.

## Preguntas abiertas

- Ninguna.
