# HU90 · Plan
- Backend: `TenantsService.isDemo`, `AuthService.demoLogin` (usuario `DEMO_EMAIL`, empresa demo y activa), `POST /auth/demo` con throttle y auditoría.
- Frontend: `AuthService.demoLogin`, página pública `pages/demo` en la ruta `demo` (CSR).
- Docs: prompt de ventas y pendientes del usuario.
- Pruebas: e2e de API en `test/demo.e2e-spec.ts`, unitaria `pages/demo/demo.spec.ts`.
