# HU86 — Cuenta demo con datos ficticios · Cierre

- **Cerrada:** 2026-11-26
- **Estado:** Terminada con pendiente del usuario (desplegar y probar en producción)
- **Verificación (spec-verifier):** 7 CUMPLE · 1 PARCIAL (C2, prueba sin datos en la otra empresa) corregido · C9 [usuario] NO VERIFICADO
- **Commits:** sin commit

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Demo con volumen y accesos que funcionan | CUMPLE | `backend/test/demo.e2e-spec.ts` (conteos, login, /leads, /conversations, /customers) |
| C2 | Restablecer borra solo la demo | CUMPLE | `demo.service.ts` `wipe`/`purge`; e2e con 3 contactos de otra empresa intactos y limpieza de restos |
| C3 | Contraseña aleatoria con bcrypt, mostrada una vez | CUMPLE | `demo.service.ts`; e2e login admin y vendedor |
| C4 | Datos deterministas y ficticios | CUMPLE | `backend/src/demo/demo-data.spec.ts` |
| C5 | Sin cobros ni prueba (legacy, escala) | CUMPLE | `demo-data.ts`; unitaria y e2e |
| C6 | Solo SUPERADMIN | CUMPLE | `demo.controller.ts`; e2e 403/401 |
| C7 | 409 ante empresa real con slug o correo | CUMPLE | `demo.service.ts`; e2e |
| C8 | Botón en Empresas con confirmación, accesos y toasts | CUMPLE | `frontend/src/app/pages/admin/demo-reset.ts` + spec |
| C9 | Prueba en producción | NO VERIFICADO [usuario] | `docs/pendientes-usuario.md` |

## Correcciones tras la verificación

- Alto: si el restablecimiento fallaba a mitad quedaban usuarios huérfanos y la demo respondía 409 para siempre. Ahora se limpia lo insertado en un `catch` y, al restablecer, se borran los restos de usuarios demo cuya empresa no existe.
- Medio: la prueba de "otra empresa intacta" ahora siembra 3 contactos.
- Medio: el modal pide entrar en incógnito (la demo reemplazaría la sesión del superadmin); se quitó "Abrir el login".
- Bajo: Escape cierra el modal; fechas de alta dentro de 90 días.

## Qué se implementó

- `Tenant.demo`, generador `backend/src/demo/demo-data.ts` (Clínica Dental Sonrisa: 4 usuarios, WhatsApp sin token, agente IA, 32 contactos, 30 conversaciones, 42 oportunidades en 7 etapas).
- `POST /admin/demo/reset` (SUPERADMIN, auditado sin datos sensibles).
- Botón "Crear / restablecer demo" en Empresas.

## Riesgos conocidos

- La cuenta de WhatsApp de la demo no tiene token: enviar desde la demo falla (intencional).
- Sin transacción: la limpieza es por `tenantId`; dos restablecimientos simultáneos desde pestañas distintas pueden fallar uno de ellos (el siguiente intento limpia).
