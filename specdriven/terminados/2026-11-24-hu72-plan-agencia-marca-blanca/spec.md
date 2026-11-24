# HU72 — Plan agencia y marca blanca · spec

## Alcance (fase 1)
- **Agencia**: empresa con `agency.seats`, que activa el superadmin en el detalle de la empresa (`PUT /admin/agency/:id`; 0 la quita). El "Plan Agencia" se vende por contacto comercial: no entra en el catálogo de checkout (PLAN_IDS), para no tocar cobros ni comprobantes.
- **Sub-cuentas**: `POST /agency/clients` crea una empresa con `parentTenantId`, plan Crece, sin prueba ni suscripción propia (la paga la agencia). Tope en `seats`; la siguiente pide sub-cuentas extra (403).
- **Cambio de cuenta sin volver a entrar**: `POST /auth/switch-tenant` emite una sesión con `tenantId` = sub-cuenta y `homeTenantId` = agencia. El refresh token guarda `actingTenantId`, así que renovar mantiene la sub-cuenta si todavía es de la agencia. Solo el TENANT_ADMIN de la agencia; ni otras empresas ni otras agencias.
- **Panel de la agencia** `/agencia`: sub-cuentas con uso (usuarios, contactos, chats 30 días) y estado, botón Entrar, barra "Volver a la agencia" en el shell.
- **Marca blanca**: nombre de la app, logo, ícono, color y dominio del panel (`PUT /agency/white-label`, dominio único).
  - `GET /public/white-label?host=` da la marca por dominio. El frontend la pide antes de la primera navegación: en ese dominio la raíz va al login o a la app (no a la landing de Maya ni a la de un evento), y cambian título, ícono, `--color-brand` y logo, y se quita "Regístrate gratis".
  - Dentro de una sub-cuenta, `GET /agency/brand` aplica la marca de la agencia.
  - CORS acepta el dominio del panel de cada agencia sin reiniciar.
  - Los correos de plataforma (recuperar contraseña, código de acceso) salen con el nombre y el logo de la agencia.

## Criterios
- C1: un usuario de la agencia ve y entra en sus 5 sub-cuentas y no en otras.
- C2: el panel servido en el dominio de la agencia muestra su logo y su nombre, sin "Maya".

## Fuera de alcance (fase 2)
- La agencia cobra a sus clientes; precio de la sub-cuenta extra en el checkout; certificado TLS automático del dominio del panel (lo agrega el operador en Coolify); suspender en cascada las sub-cuentas al suspender la agencia.
