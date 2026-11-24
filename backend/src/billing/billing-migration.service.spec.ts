import { BillingMigrationService } from './billing-migration.service';

describe('BillingMigrationService (HU40)', () => {
  it('convierte los planes viejos y marca legacy (C2)', async () => {
    const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const svc = new BillingMigrationService({ updateMany } as never);
    const n = await svc.migrate();
    expect(n).toBe(4);
    expect(updateMany).toHaveBeenCalledWith(
      { plan: 'pro' },
      { $set: { plan: 'crece', legacy: true } },
    );
    expect(updateMany).toHaveBeenCalledWith(
      { plan: 'starter' },
      { $set: { plan: 'inicia', legacy: true } },
    );
    expect(updateMany).toHaveBeenCalledWith(
      { plan: 'enterprise' },
      { $set: { plan: 'escala', legacy: true } },
    );
    // Barrido final: nada queda fuera del catálogo.
    expect(updateMany).toHaveBeenLastCalledWith(
      { plan: { $nin: ['inicia', 'crece', 'escala', 'empresa'] } },
      { $set: { plan: 'inicia', legacy: true } },
    );
  });

  it('un fallo no tumba el arranque', async () => {
    const updateMany = jest.fn().mockRejectedValue(new Error('x'));
    const svc = new BillingMigrationService({ updateMany } as never);
    await expect(svc.onModuleInit()).resolves.toBeUndefined();
  });
});
