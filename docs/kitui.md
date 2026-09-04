# UI KIT - BAR PLATFORM (Next-Gen Hospitality Design)

Este documento define la nueva estética de la plataforma, orientada a una experiencia B2C/B2B2C ultra-moderna, limpia, elegante y altamente responsiva. Tomando inspiración de aplicaciones líderes de food-delivery y hospitalidad premium.

## 1. Filosofía Visual
- **Amigable y Apetitoso:** Uso de formas orgánicas, redondeadas y espacios amplios que invitan a la interacción.
- **Elegancia Moderna:** No más interfaces rígidas de "software corporativo". El B2B debe verse tan bien como el B2C.
- **Jerarquía Clara:** Uso dramático de tipografía gruesa para encabezados y fondos blancos puros sobre tintes muy sutiles para resaltar contenido.

## 2. Paleta de Colores
- **Brand Primary (Appetite Red):** `#E11D48` (Rose/Red vibrante). Usado para botones principales, badges de acción y acentos.
- **Brand Light (Fondo suave):** `#FFF0F3`. Para fondos de cabecera, secciones destacadas y estados hover sutiles.
- **Surface / Cards:** `#FFFFFF` (Blanco puro).
- **Background App:** `#FAFAFA` (Gris casi blanco) o `#FFF0F3` (dependiendo de la zona).
- **Texto Principal:** `#111827` (Negro muy oscuro).
- **Texto Secundario:** `#6B7280` (Gris medio).
- **Bordes:** `#E5E7EB` (Gris muy claro, casi invisible).

## 3. Tipografía
- **Headings (H1, H2, Logos):** `Poppins` (Bold, SemiBold). Aporta un look geométrico, amigable y muy moderno.
- **Textos e UI:** `Inter` (Medium, Regular). Legibilidad perfecta para datos y descripciones.

## 4. Bordes y Formas (Border Radius)
La plataforma abandona los bordes duros. Todo es suave y táctil:
- **Botones y Badges:** `9999px` (Pill shape / Totalmente redondeados).
- **Tarjetas (Cards) e Imágenes:** `20px` a `24px`. Curvas pronunciadas que dan un aspecto premium de app móvil.
- **Inputs / Search:** `9999px` para barras de búsqueda, `16px` para formularios regulares.

## 5. Sombras y Profundidad (Shadows)
- **Soft Floating:** Sombras amplias, difusas y con baja opacidad. Nada de sombras cortas y duras.
- Ejemplo: `box-shadow: 0 10px 40px -10px rgba(225, 29, 72, 0.15)` para tarjetas destacadas, y `0 10px 25px -5px rgba(0,0,0, 0.05)` para tarjetas normales.

## 6. Responsive y Layout
- **Mobile-First Real:** Elementos flotantes en la parte inferior (Bottom Navs, FABs), tarjetas de ancho completo con padding interno, scrolling horizontal ocultando scrollbars para categorías.
- **Desktop:** Las tarjetas se agrupan en grid, pero conservan su padding masivo (24px - 32px) y bordes redondeados.

## 7. Animaciones
- **Sutiles y Fluidas:** Curvas `cubic-bezier(0.4, 0, 0.2, 1)`.
- **Interacciones:** Al hacer hover, las tarjetas se elevan muy sutilmente (`transform: translateY(-4px)`) y la sombra se expande. Botones se escalan ligeramente (`transform: scale(1.02)`).

## 8. App Shell móvil (PWA)

La plataforma se instala en el teléfono y se comporta como una app nativa. El
`ShellComponent` (`frontend/src/app/layout/shell/shell.ts`) monta tres piezas:

- **Cabecera fija** (`.mobile-topbar`): alto `--app-header-h` (56px) más
  `env(safe-area-inset-top)` para el notch. Muestra el logo arriba del todo y,
  en cuanto el contenido se desplaza 24px, lo cruza con el título de la pantalla
  — así no se repite el `<h1>` que ya pinta cada página. A la derecha van la
  campana de notificaciones (`<app-push-center>`) y el avatar, que abre "Más".
- **Barra inferior** (`.tabbar`): cuatro destinos según el rol
  (`TAB_PRIORITY`) más el botón **Más**. Alto `--app-tabbar-h` (62px) más
  `env(safe-area-inset-bottom)`. Lleva insignia de no leídos en Conversaciones,
  alimentada por `ConversationsRealtimeService`.
- **Hoja "Más"** (bottom sheet): el menú completo agrupado, el perfil y salir.

Reglas que se aplican solas y no hay que repetir en cada página:

- `.shell` usa `100dvh` (no `100vh`): con `vh` la barra inferior queda fuera de
  pantalla cuando el navegador móvil contrae su propia barra.
- El contenido reserva el alto de cabecera y barra inferior con `padding`, y
  lleva `overscroll-behavior-y: contain` para que el scroll no dispare el
  "tirar para recargar" del navegador.
- **Modo inmersivo**: `AppChromeService.immersive` esconde cabecera y barra
  inferior. Lo activa la bandeja de entrada al abrir un chat, para que el hilo
  ocupe la pantalla entera como cualquier app de mensajería.

### Áreas seguras

`--safe-top` / `--safe-bottom` (en `styles.scss`) envuelven
`env(safe-area-inset-*)`. Fuera de un dispositivo con muescas valen `0`, así
que se pueden sumar siempre. Toda pantalla a pantalla completa fuera del shell
(login, registro, onboarding, cambio de contraseña) las suma a su `padding`.

### Tablas → tarjetas

En móvil una tabla no se arrastra de lado: se convierte en tarjetas. Añade
`.table-cards` al contenedor y `data-label="Columna"` a cada `<td>`; el `<td>`
sin `data-label` ocupa la fila entera sin etiqueta (título de la tarjeta o fila
de botones). La regla vive en `styles.scss` y usa `!important` a propósito:
Angular encapsula los estilos de componente añadiendo un atributo a cada
selector, así que una `.mi-celda` de una página gana en especificidad a
cualquier selector razonable de la hoja global.

### Hojas inferiores (bottom sheets)

Patrón de la campana de notificaciones y del menú "Más": `.overlay` a pantalla
completa con `align-items: flex-end`, tarjeta al 100% de ancho con radio solo
arriba, `padding-bottom` que suma `env(safe-area-inset-bottom)` y entrada con
`--transition-spring`. Recuerda el "grip" (`.sheet-grip`) para que se lea como
una hoja arrastrable.
