import { PlanLimitsService } from './plan-limits.service';

const TID = '507f1f77bcf86cd799439011';

function setup(tenant: object | null, counts: Record<string, number> = {}) {
  const tenants = {
    findById: jest.fn(() => ({
      select: () => ({ lean: () => ({ exec: () => Promise.resolve(tenant) }) }),
    })),
  };
  const countDocuments = jest.fn();
  const models: Record<string, unknown> = {};
  for (const name of [
    'User',
    'WhatsAppAccount',
    'EmailAccount',
    'AiAgent',
    'Customer',
    'Event',
  ])
    models[name] = {};
  models.Campaign = {};
  models.CampaignRecipient = {};
  const connection = {
    models,
    model: (name: string) => ({
      find: () => ({
        lean: () => ({ exec: () => Promise.resolve([{ _id: 'c1' }]) }),
      }),
      countDocuments: (filter: object) => {
        countDocuments(name, filter);
        return { exec: () => Promise.resolve(counts[name] ?? 0) };
      },
    }),
  };
  return {
    svc: new PlanLimitsService(tenants as never, connection as never),
    countDocuments,
  };
}

describe('PlanLimitsService (HU42)', () => {
  it('Inicia con 2 usuarios: el 3.º da 402 PLAN_LIMIT', async () => {
    const { svc } = setup({ plan: 'inicia' }, { User: 2 });
    await expect(svc.assertCanAdd(TID, 'users')).rejects.toMatchObject({
      status: 402,
      response: { code: 'PLAN_LIMIT', resource: 'users', limit: 2, used: 2 },
    });
  });

  it('con add-on de +1 usuario, el 3.º se crea (C3)', async () => {
    const { svc } = setup(
      { plan: 'inicia', addons: { users: 1 } },
      { User: 2 },
    );
    await expect(svc.assertCanAdd(TID, 'users')).resolves.toBeUndefined();
  });

  it('legacy y Empresa no tienen límites (C4)', async () => {
    for (const t of [{ plan: 'inicia', legacy: true }, { plan: 'empresa' }]) {
      const { svc } = setup(t, { User: 999 });
      await expect(svc.assertCanAdd(TID, 'users')).resolves.toBeUndefined();
      await expect(svc.assertFeature(TID, 'recovery')).resolves.toBeUndefined();
    }
  });

  it('Inicia con 1 evento publicado vigente: publicar otro da 402 (C2)', async () => {
    const { svc, countDocuments } = setup({ plan: 'inicia' }, { Event: 1 });
    await expect(svc.assertCanAdd(TID, 'activeEvents')).rejects.toMatchObject({
      response: { code: 'PLAN_LIMIT', resource: 'activeEvents', limit: 1 },
    });
    const [, filter] = countDocuments.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(filter).toMatchObject({ status: 'published' });
  });

  it('Crece no tiene tope de eventos', async () => {
    const { svc } = setup({ plan: 'crece' }, { Event: 50 });
    await expect(
      svc.assertCanAdd(TID, 'activeEvents'),
    ).resolves.toBeUndefined();
  });

  it('funciones por plan: campañas de WhatsApp desde Crece, recuperación desde Escala (C5)', async () => {
    const inicia = setup({ plan: 'inicia' }).svc;
    await expect(
      inicia.assertFeature(TID, 'whatsapp-campaigns'),
    ).rejects.toMatchObject({
      status: 402,
      response: { code: 'PLAN_FEATURE', feature: 'whatsapp-campaigns' },
    });
    const crece = setup({ plan: 'crece' }).svc;
    await expect(
      crece.assertFeature(TID, 'whatsapp-campaigns'),
    ).resolves.toBeUndefined();
    await expect(crece.assertFeature(TID, 'recovery')).rejects.toMatchObject({
      status: 402,
    });
  });

  it('R6: el cupo de emails del mes cuenta los destinatarios de la campaña', async () => {
    const { svc } = setup({ plan: 'inicia' }, { CampaignRecipient: 999 });
    await expect(
      svc.assertCanAdd(TID, 'campaignEmailsPerMonth', 1),
    ).resolves.toBeUndefined();
    await expect(
      svc.assertCanAdd(TID, 'campaignEmailsPerMonth', 10),
    ).rejects.toMatchObject({
      response: {
        code: 'PLAN_LIMIT',
        resource: 'campaignEmailsPerMonth',
        limit: 1000,
        used: 999,
      },
    });
  });

  it('cuenta usuarios activos sin superadmin', async () => {
    const { svc, countDocuments } = setup({ plan: 'crece' });
    await svc.usage(TID, 'users');
    expect(countDocuments.mock.calls[0][1]).toMatchObject({
      isActive: { $ne: false },
      role: { $ne: 'SUPERADMIN' },
    });
  });
});
