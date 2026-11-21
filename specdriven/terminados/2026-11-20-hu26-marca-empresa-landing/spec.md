# HU26 — Logo y favicon de la empresa en la landing de sus eventos · Especificación

Historia: `hu.md` · Fecha: 2026-11-20 · Estado: aprobada

## Objetivo

La landing pública de un evento muestra hoy el favicon y el título de Maya CRM
aunque se sirva en el dominio del cliente (HU25). La empresa debe poder poner su
logo y su favicon para que sus invitados vean su marca en la pestaña y en la página.

## Usuarios

- Administrador de la empresa (TENANT_ADMIN): sube, cambia o quita logo y favicon.
- Invitado al evento (anónimo): abre el link y ve la marca de la empresa.

## Alcance

- Incluye: logo y favicon por empresa (no por evento); tarjeta «Marca de la
  empresa» en Configuración; logo visible en la landing; favicon y título de la
  pestaña en la landing (`/e/:slug` y dominio propio); aviso en la tarjeta de
  dominio propio de dónde se configura la marca.
- **Fuera de alcance:** vista previa al compartir el link en WhatsApp/redes
  (`og:image`), que exige renderizar la landing en el servidor; logo por evento;
  colores de marca; usar la marca en el resto de la app interna.

## Requisitos (EARS)

Funcionales:
- **R1** — Cuando el administrador guarda un logo o un favicon, el sistema debe
  guardarlo en la empresa del token y devolver la marca actualizada.
- **R2** — Cuando el administrador quita el logo o el favicon, el sistema debe
  borrarlo de la empresa.
- **R3** — Cuando se pide la landing pública de un evento publicado, la API debe
  devolver además la marca de su empresa: nombre, logo y favicon.
- **R4** — Cuando la landing carga un evento cuya empresa tiene logo, la página
  debe mostrar el logo con el nombre de la empresa como texto alternativo.
- **R5** — Cuando la landing carga un evento, la pestaña debe usar el favicon de
  la empresa (o su logo si no tiene favicon) y el título del evento; si la
  empresa no tiene ninguno, se mantiene el de Maya.
- **R6** — Cuando el visitante sale de la landing dentro de la app, el sistema
  debe restaurar el favicon y el título anteriores.
- **R7** — En la configuración del dominio propio del evento, el sistema debe
  indicar que el logo y el favicon se configuran en Configuración.

No funcionales:
- **R8** — Si quien guarda no es TENANT_ADMIN, entonces la API debe responder 403;
  la empresa se toma siempre del token, nunca del cuerpo.
- **R9** — Si la URL del logo o favicon no es `https://` o supera 2048
  caracteres, entonces la API debe rechazarla con 400.
- **R10** — La respuesta pública no debe exponer otros datos de la empresa
  (correo, RUC, teléfono, plan).
- **R11** — La tarjeta muestra estados de carga, error y guardado con toast; los
  archivos aceptados son imágenes PNG, JPG, WEBP o GIF (las que admite `/upload`).

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | Dado un TENANT_ADMIN, cuando hace `PATCH /tenants/me/branding` con logo y favicon https, entonces se guardan en su empresa y se devuelven | e2e de API |
| C2 | R2 | Dado una empresa con logo, cuando se envía `logo: null`, entonces el logo desaparece y el favicon se conserva | e2e de API |
| C3 | R3, R10 | Dado un evento publicado de una empresa con marca, cuando se pide `GET /public/events/:slug`, entonces trae `brand` con nombre, logo y favicon y sin correo/RUC/teléfono/plan | e2e de API |
| C4 | R8 | Dado un usuario no administrador, cuando hace `PATCH /tenants/me/branding`, entonces recibe 403 | e2e de API |
| C5 | R9 | Cuando se envía `logo: "http://x.com/a.png"` o `javascript:…`, entonces 400 | e2e de API |
| C6 | R4 | Dado un evento con marca con logo, cuando carga la landing, entonces se ve `<img>` con el logo y `alt` = nombre de la empresa | unitaria frontend |
| C7 | R5 | Dado favicon y título, cuando carga la landing, entonces el `link[rel=icon]` apunta al favicon y `document.title` es el del evento; sin favicon usa el logo; sin ambos no cambia el icono | unitaria frontend |
| C8 | R6 | Cuando se destruye la landing, entonces se restauran favicon y título | unitaria frontend |
| C9 | R1, R2, R11 | Dado la tarjeta «Marca de la empresa», cuando el admin sube un logo y guarda, entonces se llama a `/upload?folder=branding`, luego al `PATCH` y se muestra toast de éxito; si falla, toast de error | unitaria frontend |
| C10 | R7 | La tarjeta de dominio propio muestra un enlace a `/settings` para la marca | unitaria frontend |
| C11 | R4, R5 | En producción, el link de un evento muestra el logo y el favicon de la empresa | manual **[usuario]** |

## Supuestos y decisiones por defecto

- La marca es por empresa, en el campo existente `tenant.branding` (ya tiene
  `logo`); se añade `favicon`.
- Solo TENANT_ADMIN la edita (como `PATCH /tenants/me` y `PUT /settings`).
- La tarjeta vive en Configuración (`/settings`), visible para quien entra allí;
  si no es admin, se muestra en solo lectura.
- Favicon: se recomienda PNG cuadrado (p. ej. 512×512). No se aceptan SVG ni ICO
  porque `/upload` no los admite (SVG puede llevar scripts).
- El logo se muestra en una píldora blanca fija arriba a la izquierda, por
  encima del diseño, sin tapar el botón de música (arriba a la derecha).

## Preguntas abiertas

- Ninguna.
