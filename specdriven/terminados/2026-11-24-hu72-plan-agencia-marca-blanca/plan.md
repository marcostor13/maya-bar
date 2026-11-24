# HU72 · plan
1. Tenant: `agency`, `parentTenantId`, `whiteLabel`; RefreshToken: `actingTenantId`.
2. AuthService: `switchTenant`, refresh que conserva la sub-cuenta, `homeTenantId` en el JWT.
3. Módulo `agency`: panel, alta de clientes, marca blanca, plan por superadmin, marca pública por dominio, marca de la sesión.
4. CORS dinámico para los dominios de panel; marca en los correos de plataforma.
5. e2e (C1, C2).
6. Frontend: BrandService con inicializador, ruta raíz del dominio de panel, página `/agencia`, shell (logo, menú, barra) y login; sección Plan Agencia en el detalle de empresa del superadmin.
