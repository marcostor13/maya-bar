# HU25 — Dominio propio para la landing de un evento · Especificación

Historia: `hu.md` · Fecha: 2026-11-19 · Estado: aprobada

## Objetivo

Las landings viven en `mayacrm.site/e/<slug>`. Se reutiliza el alta automática que ya tienen los dominios de links cortos (DNS apuntando al servidor → la plataforma añade el dominio a la app en Coolify, Traefik emite el certificado), pero sobre la app del **frontend**, que es la que sirve las landings.

## Usuarios

- Organizador (roles de eventos): registrar, verificar, reasignar y quitar el dominio.
- Visitante: abrir `https://<dominio>` y ver la landing.

## Alcance

- Incluye: modelo `LandingDomain` (empresa, dominio, evento, estado); API para listar, añadir, verificar, cambiar evento y quitar; resolución pública `host → slug`; alta automática en la app del frontend por la API de Coolify; servidor SSR que entrega la app de cliente (no la landing de marketing) en dominios ajenos; ruta raíz que muestra el evento del dominio; CORS abierto para las rutas públicas de eventos; tarjeta «Dominio propio» en Marketing del evento; documentación.
- **Fuera de alcance:** comprar dominios; gestionar el DNS del cliente; varios eventos en rutas de un mismo dominio (la raíz muestra uno; `/e/<slug>` sigue funcionando); proxy naranja de Cloudflare delante del dominio del cliente.

## Requisitos (EARS)

- **R1** — Cuando el organizador registra un dominio para un evento de su empresa, el sistema debe guardarlo en minúsculas, rechazar los de la plataforma (frontend, API y sus subdominios), los inválidos y los ya usados por cualquier empresa como landing **o como dominio de links**, y verificarlo al momento.
- **R2** — Al verificar, si el dominio resuelve (registro A, o CNAME que acaba en la IP) a la IP del servidor y responde `https://<dominio>/healthz`, queda `active`. Si resuelve bien pero no responde, el sistema debe pedir el alta en la app del frontend por la API de Coolify (una vez cada 10 min como mucho) y quedar `activating`. Si no resuelve o apunta a otra IP, queda `pending` con un mensaje que dice qué registro crear.
- **R3** — El UUID de la app del frontend sale de `COOLIFY_FRONTEND_APP_UUID` o, si falta, se descubre en Coolify buscando la app cuyo dominio es el de `FRONTEND_URL`. Sin Coolify configurado, el estado queda `dns_ok` explicando que el alta es manual.
- **R4** — `GET /public/landing-domains/resolve?host=` debe devolver el `slug` del evento publicado asignado a un dominio `active`; en cualquier otro caso 404.
- **R5** — En un dominio que no es de la plataforma, el servidor del frontend debe entregar la app de cliente (no la landing de marketing prerenderizada) y la ruta raíz debe mostrar la landing del evento resuelta por el host. En los dominios de la plataforma nada cambia.
- **R6** — Las rutas `/public/events*` y `/public/landing-domains*` deben aceptar cualquier origen (CORS), como ya hacen `/public/forms`.
- **R7** — Quitar un dominio lo borra y lo saca de la app del frontend en Coolify; si eso falla, el borrado sigue.
- **R8** — Solo la empresa dueña ve y gestiona sus dominios. Ver: roles de eventos; registrar, verificar, reasignar y quitar: roles de eventos salvo IMPULSADOR (403).
- **R9** — Propiedad: además del DNS, el TXT `_maya-verify.<dominio>` = `maya-verify=<token>` de la empresa. Un dominio sin verificar de otra empresa se libera a las 72 h. Máximo 10 dominios por empresa; un alta en Coolify cada 10 min por dominio (también tras un fallo).
- **R9** — La tarjeta «Dominio propio» muestra las instrucciones (CNAME a `mayacrm.site` para subdominios, A a la IP para el dominio raíz, nube gris en Cloudflare), el estado, y permite verificar y quitar, con toasts y confirmación.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | Dominio de plataforma, inválido, ya usado (landing o link) → 400/409; válido → creado y verificado | e2e `landing-domains` |
| C2 | R2, R3 | DNS mal → `pending`; DNS bien sin respuesta → alta en Coolify en la app del frontend y `activating`; responde → `active` | unitaria del servicio |
| C3 | R4 | Activo con evento publicado → slug; pendiente, sin evento o borrador → 404 | e2e |
| C4 | R5 | Host ajeno: `/` entrega `index.csr.html`; host propio: la landing; la ruta raíz monta la landing por host | unitaria del helper de host + `public-event.spec` |
| C5 | R6 | Petición con `Origin: https://fiesta.com` a `/public/events/x` lleva `Access-Control-Allow-Origin` | e2e |
| C6 | R7, R8 | Quitar llama a Coolify; otra empresa → 404; rol sin permiso → 403 | e2e + unitaria |
| C7 | R9 | La tarjeta lista, añade, verifica y quita | unitaria del componente |
| C8 | — | Crear el CNAME real y abrir la landing por el dominio **[usuario]** | manual |

## Supuestos y decisiones por defecto

- CNAME de destino: el host de `FRONTEND_URL` (`mayacrm.site`), que es un registro A en gris hacia el servidor. Si algún día se pone en naranja, los CNAME de los clientes dejarían de validar.
- Cada alta redespliega el frontend (rodante): unos segundos de relevo.
- La verificación es manual (botón) más una al registrar; no hay tarea periódica.

## Preguntas abiertas

- ninguna
