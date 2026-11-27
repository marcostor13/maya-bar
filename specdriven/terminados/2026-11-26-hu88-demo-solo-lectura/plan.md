# HU88 · Plan
- `BillingAccessService.snapshot` selecciona también `demo`; `BillingSnapshot.demo?`.
- `ReadOnlyInterceptor`: antes de las rutas siempre permitidas, si la empresa es demo y el
  método escribe y la ruta no es `/auth/logout|refresh` → `ForbiddenException` DEMO_READ_ONLY.
- `billing.controller` `status` devuelve `demo`.
- Frontend: `BillingStatus.demo?`; `trial-banner` con aviso de demo (tono info, sin botones).
- Docs: prompt de ventas, pendientes.
