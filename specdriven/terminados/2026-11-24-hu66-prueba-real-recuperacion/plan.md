# HU66 — Plan
- e2e `test/recovery-resume.e2e-spec.ts`:
  - Proceso 1: clasifica 3 lotes y el 4.º cae.
  - `app.close()`.
  - Proceso 2: nueva instancia sobre la misma base, solo manda a la IA lo que faltaba y conserva las notas.
- `UsageLedger.units` y `AiCreditsService.usageByAction` (excluye BYOK); endpoint de superadmin.
- Guion de prueba manual con tabla de resultados y regla de decisión para HU56.
