# HU20 — Datos por usuario en el dashboard · Especificación

Historia: `hu.md` · Fecha: 2026-11-18 · Estado: aprobada (decisiones por defecto)

## Objetivo

El dashboard muestra métricas de la empresa, pero no por persona. El administrador necesita comparar el trabajo de cada usuario en el mismo periodo y canal que ya elige en el dashboard.

## Usuarios

- TENANT_ADMIN y MANAGER (supervisores): ven a todos los usuarios activos de su empresa.
- Resto de roles: ven solo su propia fila.

## Alcance

- Incluye: tabla «Rendimiento por usuario» con, por usuario y periodo: mensajes enviados a mano, chats que atiende ahora, leads nuevos asignados, ganados, valor ganado, perdidos, contactos nuevos asignados, contactos a su cargo y cuántos quedaron sin seguimiento en el periodo, actividades registradas y llamadas atendidas. Orden por la columna elegida. Totales.
- Usar `Message.sentBy`, que la bandeja guarda desde el 2026-08-25 al enviar a mano.
- **Fuera de alcance:** tiempos de respuesta por usuario, exportar a CSV, filtrar el resto del dashboard por usuario, contar mensajes manuales anteriores al 2026-08-25 (no tienen `sentBy`).

## Requisitos (EARS)

Funcionales:
- **R1** — Cuando un usuario envía un mensaje desde la bandeja, el sistema debe guardar su id en `sentBy` (ya existía; se cubre con prueba).
- **R2** — Cuando un supervisor abre el dashboard, el sistema debe devolver una fila por usuario activo de su empresa (sin SUPERADMIN) con las métricas del periodo y canal elegidos.
- **R3** — Cuando quien abre el dashboard no es supervisor, el sistema debe devolver solo su fila.
- **R4** — El sistema debe calcular: mensajes = `Message` out/human con `sentBy` en el rango (y canal); chats atendidos = conversaciones con `status: 'open'` y `takenOverBy` (sin papelera, canal); contactos a cargo = `Customer.ownerId` hoy, y sin seguimiento = esos sin ninguna `ContactActivity` manual con `at` en el rango; leads nuevos = `Lead.ownerId` creados en el rango; ganados/valor/perdidos = `Lead.ownerId` con `closedAt` en el rango; contactos = `Customer.ownerId` creados en el rango; actividades = `ContactActivity.createdBy` de tipos manuales en el rango; llamadas = `Call.answeredBy` con `startedAt` en el rango.
- **R5** — La tabla debe permitir ordenar por cualquier columna y mostrar el total del equipo.

No funcionales:
- **R6** — Aislamiento: solo datos del `tenantId` del JWT. Una consulta agregada por métrica, sin consultas por usuario.
- **R7** — Accesibilidad: tabla con encabezados, botones de orden con `aria-sort`; estados cargando, vacío y error.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | Dado un usuario que envía un mensaje manual, entonces el mensaje guarda `sentBy` con su id | unitaria |
| C2 | R2, R4, R6 | Dado datos de dos usuarios y de otra empresa, cuando el admin pide `/dashboard/users`, entonces cada fila trae sus métricas y nada de la otra empresa | e2e API |
| C3 | R3 | Dado un rol no supervisor, cuando pide `/dashboard/users`, entonces solo recibe su fila | e2e API |
| C4 | R4 | Con `channel`, los mensajes y chats se limitan a ese canal | e2e API |
| C5 | R5, R7 | La tabla pinta filas, totales, ordena por columna y muestra vacío/error | unitaria frontend |

## Supuestos y decisiones por defecto

- Usuarios inactivos no salen aunque tengan datos del periodo (se ven solo los actuales).
- «Chats que atiende» es una foto de ahora, no del periodo; la columna lo dice.
- Los mensajes manuales tienen `sentBy` desde el 2026-08-25; los anteriores no se atribuyen.

## Preguntas abiertas

- ninguna
