# HU12 — Links clicables en los mensajes de los chats

## Historia

**Como** persona del equipo que atiende la bandeja,
**quiero** que los links que llegan o se envían en una conversación se vean
como links y se abran con un clic,
**para** no tener que copiar y pegar cada dirección para ver lo que mandó el
cliente o lo que le enviamos.

## Problema observado

- La burbuja del mensaje pinta el texto plano: `<p class="bubble-text">{{ m.text }}</p>`
  (`frontend/src/app/pages/inbox/inbox.ts`, ≈ línea 841). Una URL se ve como
  texto y no se puede pulsar.
- Lo mismo pasa con la lectura de adjuntos (`m.transcript`, ≈ línea 849), las
  notas del sistema (≈ línea 768) y las burbujas del playground de agentes IA
  (`ai-agents.ts`, ≈ línea 780), donde el agente suele mandar links de pago,
  de la tienda o de agendamiento.

## Alcance pedido

1. Detectar en el texto de los mensajes (entrantes y salientes, de todos los
   canales: WhatsApp, Messenger, Instagram, correo, SMS) las direcciones
   `http://` / `https://` y las que empiezan por `www.`, y pintarlas como link.
   Se abren en una pestaña nueva (`target="_blank" rel="noopener noreferrer"`).
2. También los correos (`nombre@dominio`) como `mailto:`. Los teléfonos quedan
   fuera, para no marcar como link números de pedido o montos.
3. No romper el texto: se mantienen los saltos de línea (`pre-wrap`) y el corte
   de URLs largas (`overflow-wrap: anywhere`). La puntuación final que no es
   parte de la URL (`.`, `,`, `)`, `!`, `?`) queda fuera del link.
4. Seguridad: nada de `innerHTML` con el texto del cliente sin escapar. El texto
   se parte en trozos (texto / link) y se pintan con la plantilla de Angular, o
   se escapa antes. Solo se aceptan esquemas `http`, `https` y `mailto`
   (nunca `javascript:` ni `data:`).
5. El link se distingue con los colores del design system (variables de
   `styles.scss`) y se lee bien en la burbuja propia y en la del cliente.
6. Mismo comportamiento en: burbujas de la bandeja, lectura de adjuntos, notas
   del sistema y playground de agentes IA. Opcional en notas de leads
   (`leads.ts` ≈ 551) y seguimiento de contactos (`contact-care.ts` ≈ 197).

## Contexto y supuestos a validar en la spec

- Hacerlo como pieza compartida (pipe o componente en `src/app/shared`) con
  pruebas unitarias: URL al final de frase, entre paréntesis, varias en un
  mismo mensaje, `www.` sin esquema, texto con `<script>` (debe verse como
  texto), `javascript:` (no se convierte en link).
- En la app móvil (Capacitor) comprobar que el link abre el navegador del
  sistema y no navega dentro de la propia app.
- Los links cortos de la plataforma (módulo de links) deben seguir contando
  el clic: el link apunta a la URL corta tal cual, sin reescribirla.
- No cambia lo que se guarda ni lo que se envía al cliente: es solo cómo se
  muestra.
- Pruebas: unitarias del detector y una de la bandeja que compruebe que un
  mensaje con URL pinta un `<a>` con el `href` correcto.
