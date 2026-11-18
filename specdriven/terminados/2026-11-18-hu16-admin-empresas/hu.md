# HU16 — Administración total de las empresas (superadministrador)

## Historia

**Como** superadministrador de Maya CRM,
**quiero** administrar por completo cada empresa desde la plataforma,
**para** dar soporte, suspender o reactivar clientes y cambiar su plan sin tocar la base de datos.

## Contexto (estado actual)

- `/admin/tenants` lista empresas y permite crear, editar (modal), activar/desactivar y eliminar.
- **Desactivar no tiene efecto:** `Tenant.isActive` no se comprueba en el login, en las sesiones ni en la API de integraciones.
- No hay ficha de la empresa: no se ven sus usuarios, su uso ni sus cuentas conectadas.
- No se pueden editar el vencimiento del plan ni el fin de la prueba; no hay búsqueda ni filtros.
- Eliminar pide una confirmación simple aunque borra todos los datos.
- Las acciones sobre empresas no quedan registradas.

## Qué se espera

1. Buscar empresas por nombre, correo o RUC y filtrar por plan y estado.
2. Ficha de la empresa a pantalla completa con:
   - datos editables: nombre, correo, RUC, teléfono, plan, vencimiento del plan, fin de la prueba;
   - usuarios de la empresa (rol, estado, último acceso);
   - uso: contactos, conversaciones, mensajes enviados en los últimos 30 días, cuentas conectadas por canal, accesos de API.
3. **Suspender** una empresa de verdad: nadie de esa empresa puede entrar, sus sesiones abiertas se cortan y sus claves de API dejan de funcionar. Reactivar lo revierte.
4. Eliminar escribiendo el nombre de la empresa para confirmar.
5. Registro de las acciones del superadministrador sobre empresas (quién, qué, cuándo, cambios).
