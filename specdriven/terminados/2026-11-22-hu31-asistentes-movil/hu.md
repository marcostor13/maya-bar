# HU31 — Lista de asistentes legible en el móvil

## Historia

**Como** encargado que revisa quién se registró desde el móvil,
**quiero** una lista compacta en la que pueda ordenar y contactar al asistente con un toque,
**para** recorrer muchos registros sin hacer scroll infinito.

## Contexto (estado actual)

Archivo: `pages/events/tabs/event-registrations-tab.ts`.

- **Tarjetas demasiado largas.** En ≤ 768 px la tabla pasa a tarjetas (l.193-215), pero cada tarjeta repite las 9 columnas como filas: email, teléfono, personas, ticket, impulsador, check-in, estado y fecha.
  - Son unos 9 renglones por asistente: con 100 registros, la lista es enorme.
- **Se pierde el orden.** La cabecera se oculta (`thead { display: none }`, l.201), y con ella los únicos controles de orden (l.61-81).
- **El teléfono es texto plano**: no se puede llamar ni escribir por WhatsApp.
- **El botón de desplegar** las respuestas del formulario mide 26 px (l.181).
- **El buscador mide 14 px** (l.158) y no usa `.input`: iOS hace zoom.
  - Además dispara una petición en cada tecla (`onRegSearchChange`).
- **Colores fijos**: `#fff`, `#f8faff`, `#dcfce7`.

## Propuesta

1. **Tarjeta compacta** de 2 renglones:
   - Nombre y chips (personas, Confirmado o Cancelado, Ingresó).
   - Debajo, impulsador y fecha en gris.
   - Al tocar se despliega el detalle: email, teléfono, ticket y respuestas del formulario.
2. **Acciones de contacto** en el detalle: "Llamar" (`tel:`) y "WhatsApp".
   - Si existe, el WhatsApp abre el chat del contacto en Conversaciones; si no, abre `wa.me`.
   - También "Copiar email".
3. **"Ordenar por"** (nombre, fecha, personas) visible en el móvil, junto al filtro de estado.
4. **Buscador** con `.input`/`.input-search` (16 px en el móvil) y 300 ms de espera antes de buscar.
5. **Colores** con variables.

## Supuestos

- Abrir el chat de Conversaciones necesita que el asistente esté como contacto; si no lo está, se usa `wa.me` con el teléfono normalizado.

## Criterios de aceptación (borrador)

- C1: a 360 px cada asistente ocupa ≤ 2 renglones cerrado y el detalle se abre al tocar.
- C2: se puede ordenar por nombre, fecha y personas en el móvil.
- C3: "Llamar" y "WhatsApp" aparecen solo si hay teléfono y abren la app correcta.
- C4: escribir en el buscador no hace zoom en iOS y lanza una sola petición tras dejar de escribir.
