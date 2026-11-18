# HU16 — Administración total de las empresas · Especificación

Historia: `hu.md` · Fecha: 2026-11-18 · Estado: aprobada

## Objetivo

Que el superadministrador gestione cada empresa de punta a punta (datos, plan,
suspensión real, uso, usuarios y eliminación segura) sin tocar la base de datos.

## Usuarios

- SUPERADMIN.

## Alcance

- Incluye: búsqueda y filtros, ficha a pantalla completa, edición de todos los
  datos de plataforma, suspensión efectiva, uso, usuarios de la empresa,
  eliminación con confirmación por nombre y registro de acciones.
- **Fuera de alcance:** facturación y cobro del plan; límites por plan; detener
  el agente IA o las campañas en curso de una empresa suspendida (se anota como
  riesgo); "entrar como" un usuario.

## Requisitos (EARS)

- **R1** — Cuando el superadmin escribe en el buscador o elige plan/estado, la
  lista debe mostrar solo las empresas que coinciden (nombre, correo o RUC).
- **R2** — Cuando abre una empresa, el sistema debe mostrar su ficha con datos
  editables (nombre, correo, RUC, teléfono, plan, vencimiento del plan, fin de
  la prueba), sus usuarios (nombre, correo, rol, estado, último acceso) y su
  uso (contactos, conversaciones, mensajes enviados en 30 días, cuentas
  conectadas por canal y accesos de API vigentes).
- **R3** — Cuando el superadmin **suspende** una empresa, el sistema debe:
  rechazar el login de sus usuarios con un mensaje claro, cortar sus sesiones
  abiertas (siguiente petición 401, también el refresh) y rechazar sus claves
  de API (401). Reactivar lo revierte.
- **R4** — Si el superadmin elimina una empresa, entonces debe escribir su
  nombre exacto; si no coincide, el servidor responde 400 y no borra nada.
- **R5** — Cada creación, edición, suspensión, reactivación y eliminación de
  empresa queda registrada (autor, empresa, acción, cambios, fecha) y se ve en
  la ficha.
- **R6** (seguridad) — Todas las rutas exigen SUPERADMIN (403 para otros
  roles); el correo nuevo de la empresa no puede estar en uso por otra (409);
  el plan solo admite `starter|pro|enterprise`.
- **R7** (interfaz) — Ficha con `app-form-page`, toast y confirmaciones,
  estados de carga/vacío/error, móvil.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | Buscar "acme" y filtrar "Suspendidas" muestra solo esas | unitaria frontend |
| C2 | R2 | `GET /admin/tenants/:id/overview` devuelve datos, usuarios (sin hash) y uso | e2e API |
| C3 | R2, R6 | `PATCH /tenants/:id` con plan, fechas y correo; correo repetido → 409; plan inválido → 400 | e2e API |
| C4 | R3 | Suspender: login 401 con mensaje de empresa suspendida, token previo 401, refresh 401, clave de API 401; reactivar → login OK | e2e API |
| C5 | R4 | `DELETE` sin nombre o con otro nombre → 400; con el nombre → borra | e2e API |
| C6 | R5 | Las acciones quedan en `GET /admin/tenants/:id/audit` | e2e API |
| C7 | R6 | Un TENANT_ADMIN recibe 403 en las rutas de plataforma | e2e API |
| C8 | R7 | La ficha muestra usuarios y uso; suspender pide confirmación y avisa con toast | unitaria frontend |

## Supuestos y decisiones por defecto

- "Suspender" = `isActive: false` (el campo ya existe).
- El registro usa una colección nueva `tenant_audit` (TTL 2 años).
- La caché de sesiones (60 s) se invalida al suspender, para que el corte sea inmediato en esta instancia.

## Preguntas abiertas

- Ninguna.
