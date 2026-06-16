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
