import { estimateCostUsd } from './ai-cost';
import { AiCreditsService, periodOf } from './ai-credits.service';

const TID = '507f1f77bcf86cd799439011';

function setup(opts: {
  included?: number | null;
  unlimited?: boolean;
  usedFromPlan?: number;
  purchased?: number;
  expiresAt?: Date;
}) {
  const ledger = {
    aggregate: jest.fn(() => ({
      exec: () =>
        Promise.resolve(
          opts.usedFromPlan ? [{ fromPlan: opts.usedFromPlan }] : [],
        ),
    })),
    create: jest.fn().mockResolvedValue({}),
  };
  const tenants = {
    findById: jest.fn(() => ({
      select: () => ({
        lean: () => ({
          exec: () =>
            Promise.resolve({
              aiCreditsPurchased: opts.purchased ?? 0,
              aiCreditsPurchasedExpiresAt: opts.expiresAt,
            }),
        }),
      }),
    })),
    updateOne: jest.fn(() => ({ exec: () => Promise.resolve({}) })),
  };
  const limits = {
    effective: jest.fn().mockResolvedValue({
      unlimited: !!opts.unlimited,
      limits: {
        aiCreditsPerMonth: opts.included === undefined ? 500 : opts.included,
      },
      features: [],
    }),
  };
  return {
    svc: new AiCreditsService(
      ledger as never,
      tenants as never,
      limits as never,
    ),
    ledger,
    tenants,
  };
}

describe('AiCreditsService (HU43)', () => {
  it('periodo AAAA-MM en UTC', () => {
    expect(periodOf(new Date('2026-12-31T23:59:00Z'))).toBe('2026-12');
  });

  it('saldo = plan del mes − consumo + recargas vigentes', async () => {
    const { svc } = setup({
      usedFromPlan: 450,
      purchased: 100,
      expiresAt: new Date('2099-01-01'),
    });
    expect(await svc.balance(TID)).toMatchObject({
      included: 500,
      usedFromPlan: 450,
      purchased: 100,
      remaining: 150,
    });
  });

  it('C4: recarga vencida no cuenta', async () => {
    const { svc } = setup({
      usedFromPlan: 500,
      purchased: 100,
      expiresAt: new Date('2020-01-01'),
    });
    const b = await svc.balance(TID);
    expect(b.purchased).toBe(0);
    expect(b.remaining).toBe(0);
    await expect(svc.assertCanSpend(TID, 'agent_reply')).rejects.toMatchObject({
      status: 402,
      response: { code: 'AI_CREDITS' },
    });
  });

  it('C4: agotado el plan, el consumo descuenta de las recargas', async () => {
    const { svc, ledger, tenants } = setup({
      usedFromPlan: 499,
      purchased: 50,
      expiresAt: new Date('2099-01-01'),
    });
    await svc.record(TID, 'recovery', {
      byok: false,
      model: 'm',
      inputTokens: 1,
      outputTokens: 2,
    });
    // 3 créditos: 1 del plan y 2 de la recarga.
    expect(tenants.updateOne).toHaveBeenCalledWith(
      { _id: TID },
      { $inc: { aiCreditsPurchased: -2 } },
    );
    expect(ledger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'recovery',
        units: 1,
        credits: 3,
        fromPurchased: 2,
        aiModel: 'm',
        costUsd: expect.any(Number),
      }),
    );
  });

  it('C2: con key propia anota 0 créditos', async () => {
    const { svc, ledger, tenants } = setup({ usedFromPlan: 500 });
    await svc.record(TID, 'agent_reply', { byok: true });
    expect(tenants.updateOne).not.toHaveBeenCalled();
    expect(ledger.create).toHaveBeenCalledWith(
      expect.objectContaining({ credits: 0, byok: true, costUsd: 0 }),
    );
  });

  it('unidades: 3 créditos por conversación de recuperación', async () => {
    const { svc } = setup({ usedFromPlan: 490 });
    await expect(svc.assertCanSpend(TID, 'recovery', 4)).rejects.toMatchObject({
      status: 402,
    });
    await expect(
      svc.assertCanSpend(TID, 'recovery', 3),
    ).resolves.toBeUndefined();
  });

  it('legacy/Empresa: nunca se bloquea', async () => {
    const { svc } = setup({ unlimited: true, usedFromPlan: 99999 });
    await expect(
      svc.assertCanSpend(TID, 'prospecting'),
    ).resolves.toBeUndefined();
  });
});

describe('estimateCostUsd (HU43)', () => {
  it('usa la tarifa del modelo y, si no la conoce, la del proveedor', () => {
    expect(
      estimateCostUsd('gpt-4o-mini', 'openai', 1_000_000, 1_000_000),
    ).toBeCloseTo(0.75);
    expect(
      estimateCostUsd('modelo-raro', 'deepseek', 1_000_000, 0),
    ).toBeCloseTo(0.28);
    expect(estimateCostUsd('x', 'openai', 0, 0)).toBe(0);
  });

  it('HU66: costo real por unidad y por acción (sin keys propias)', async () => {
    const { svc, ledger } = setup({});
    ledger.aggregate.mockReturnValueOnce({
      exec: () =>
        Promise.resolve([
          {
            _id: 'recovery',
            calls: 4,
            units: 50,
            credits: 150,
            costUsd: 0.25,
            inputTokens: 1000,
            outputTokens: 500,
          },
        ]) as never,
    });
    const rows = await svc.usageByAction('2026-11');
    expect(rows).toEqual([
      expect.objectContaining({
        action: 'recovery',
        units: 50,
        costPerUnitUsd: 0.005,
        creditsPerUnit: 3,
      }),
    ]);
    const pipeline = (
      ledger.aggregate.mock.calls.at(-1) as unknown as [
        Record<string, unknown>[],
      ]
    )[0];
    expect(pipeline[0]).toEqual({
      $match: { period: '2026-11', byok: { $ne: true } },
    });
  });
});
