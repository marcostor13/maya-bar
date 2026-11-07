import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { RecoveryService } from './recovery.service';
import {
  NothingToAnalyzeError,
  RecoveryAnalysisService,
} from './recovery-analysis.service';

const TENANT = new Types.ObjectId().toString();
const CAMPAIGN_ID = new Types.ObjectId().toString();

const chain = (value: unknown) => {
  const q: any = {};
  for (const m of ['sort', 'limit', 'lean', 'select']) q[m] = () => q;
  q.exec = () => Promise.resolve(value);
  return q;
};

describe('Recuperación por campaña', () => {
  function service(conv: unknown) {
    const planModel = {
      create: jest.fn((d: Record<string, unknown>) => Promise.resolve(d)),
    };
    const conversationModel = {
      findOne: jest.fn(() => chain(conv)),
      aggregate: jest.fn(() => ({
        exec: () =>
          Promise.resolve([
            { _id: { kind: 'ad', id: '120' }, name: 'Promo', count: 2 },
          ]),
      })),
    };
    const worker = { kick: jest.fn().mockResolvedValue(undefined) };
    const svc = new RecoveryService(
      planModel as never,
      conversationModel as never,
      worker as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { svc, planModel, conversationModel };
  }

  it('crea el plan con la campaña elegida y su nombre', async () => {
    const { svc, planModel, conversationModel } = service({
      campaign: { name: 'Black Friday' },
    });
    await svc.create(TENANT, 'u1', {
      lookbackDays: 30,
      campaign: `campaign:${CAMPAIGN_ID}`,
    });
    expect(conversationModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: new Types.ObjectId(TENANT),
        channel: 'whatsapp',
        'campaign.kind': 'campaign',
        'campaign.id': CAMPAIGN_ID,
      }),
      { campaign: 1 },
    );
    expect(planModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Recuperación de Black Friday',
        campaign: { kind: 'campaign', id: CAMPAIGN_ID, name: 'Black Friday' },
      }),
    );
  });

  it('lista solo campañas de chats de WhatsApp de la empresa', async () => {
    const { svc, conversationModel } = service(null);
    const res = await svc.campaigns(TENANT);
    const [pipeline] = (conversationModel.aggregate.mock.calls as any[])[0];
    expect(pipeline[0].$match).toMatchObject({
      tenantId: new Types.ObjectId(TENANT),
      channel: 'whatsapp',
    });
    expect(res).toEqual([
      { key: 'ad:120', kind: 'ad', id: '120', name: 'Promo', count: 2 },
    ]);
  });

  it('sin campaña el plan es de todas las conversaciones', async () => {
    const { svc, planModel, conversationModel } = service(null);
    await svc.create(TENANT, 'u1', { lookbackDays: 30 });
    expect(conversationModel.findOne).not.toHaveBeenCalled();
    expect(planModel.create.mock.calls[0][0]).not.toHaveProperty('campaign');
  });

  it('rechaza una campaña inválida o sin conversaciones', async () => {
    await expect(
      service(null).svc.create(TENANT, 'u1', {
        lookbackDays: 30,
        campaign: 'campaign:no-es-id',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service(null).svc.create(TENANT, 'u1', {
        lookbackDays: 30,
        campaign: 'ad:120',
      }),
    ).rejects.toThrow(/No hay conversaciones/);
  });

  it('el análisis solo toma las conversaciones de esa campaña', async () => {
    const conversationModel = { find: jest.fn(() => chain([])) };
    const messageModel = { find: jest.fn(() => chain([])) };
    const analysis = new RecoveryAnalysisService(
      {} as never,
      conversationModel as never,
      messageModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const plan = {
      tenantId: new Types.ObjectId(TENANT),
      lookbackDays: 30,
      campaign: { kind: 'ad', id: '120', name: 'Promo verano' },
    };
    await expect(analysis.run(plan as never)).rejects.toThrow(
      NothingToAnalyzeError,
    );
    await expect(analysis.run(plan as never)).rejects.toThrow(/Promo verano/);
    expect(conversationModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'whatsapp',
        'campaign.kind': 'ad',
        'campaign.id': '120',
      }),
    );
  });
});
