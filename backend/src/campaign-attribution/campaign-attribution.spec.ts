import { Types } from 'mongoose';
import {
  campaignFromReferral,
  parseCampaignFilter,
  touchAddress,
  touchChannelFor,
} from './campaign-attribution';
import { CampaignAttributionService } from './campaign-attribution.service';

const TENANT = new Types.ObjectId().toString();
const CAMPAIGN = { _id: new Types.ObjectId(), name: 'Black Friday' };
const DAY = 86_400_000;

describe('campaign-attribution helpers', () => {
  it('normaliza teléfonos por sus últimos 9 dígitos y correos en minúsculas', () => {
    expect(touchAddress('phone', '+51 999 888 777')).toBe('999888777');
    expect(touchAddress('phone', '51999888777')).toBe('999888777');
    expect(touchAddress('phone', '999888777')).toBe('999888777');
    expect(touchAddress('phone', '123')).toBeNull();
    expect(touchAddress('email', ' Ana@Cliente.PE ')).toBe('ana@cliente.pe');
    expect(touchAddress('email', 'sin-arroba')).toBeNull();
    expect(touchChannelFor('whatsapp')).toBe('phone');
    expect(touchChannelFor('email')).toBe('email');
    expect(touchChannelFor('instagram')).toBeNull();
  });

  it('convierte el anuncio de Click-to-WhatsApp en origen', () => {
    expect(
      campaignFromReferral({ adId: '120', headline: '  Promo   verano ' }),
    ).toMatchObject({ kind: 'ad', id: '120', name: 'Promo verano' });
    expect(campaignFromReferral({ adId: '120' })?.name).toBe('Anuncio 120');
    expect(campaignFromReferral({ ctwaClid: 'x' })).toBeNull();
  });

  it('valida el filtro de campaña', () => {
    const id = new Types.ObjectId().toString();
    expect(parseCampaignFilter(`campaign:${id}`)).toEqual({
      kind: 'campaign',
      id,
    });
    expect(parseCampaignFilter('ad:120211')).toEqual({
      kind: 'ad',
      id: '120211',
    });
    expect(parseCampaignFilter('campaign:no-es-id')).toBeNull();
    expect(parseCampaignFilter('ad:{"$ne":1}')).toBeNull();
    expect(parseCampaignFilter('')).toBeNull();
  });
});

describe('CampaignAttributionService', () => {
  function setup(touches: Record<string, any>[] = []) {
    const model = {
      insertMany: jest.fn((rows: Record<string, any>[]) => {
        touches.push(...rows);
        return Promise.resolve(rows);
      }),
      findOne: jest.fn((f: Record<string, any>) => {
        const hits = touches
          .filter(
            (t) =>
              String(t.tenantId) === String(f.tenantId) &&
              t.channel === f.channel &&
              t.address === f.address &&
              t.at >= f.at.$gte &&
              t.at <= f.at.$lte,
          )
          .sort((a, b) => b.at - a.at);
        const q = {
          sort: () => q,
          exec: () => Promise.resolve(hits[0] ?? null),
        };
        return q;
      }),
    };
    return {
      service: new CampaignAttributionService(model as never),
      model,
      touches,
    };
  }

  it('registra los envíos sin duplicar direcciones', async () => {
    const { service, touches } = setup();
    const n = await service.recordTouches(TENANT, CAMPAIGN, 'phone', [
      '+51 999888777',
      '51999888777',
      '',
      null,
    ]);
    expect(n).toBe(1);
    expect(touches[0]).toMatchObject({
      campaignName: 'Black Friday',
      channel: 'phone',
      address: '999888777',
    });
  });

  it('un fallo al registrar no lanza', async () => {
    const { service, model } = setup();
    model.insertMany.mockRejectedValueOnce(new Error('mongo caído'));
    await expect(
      service.recordTouches(TENANT, CAMPAIGN, 'email', ['a@b.pe']),
    ).resolves.toBe(0);
  });

  it('atribuye la campaña más reciente dentro de 30 días', async () => {
    const now = new Date('2026-11-06T12:00:00Z');
    const old = { _id: new Types.ObjectId(), name: 'Vieja' };
    const { service } = setup();
    await service.recordTouches(
      TENANT,
      old,
      'phone',
      ['999888777'],
      new Date(now.getTime() - 40 * DAY),
    );
    expect(
      await service.lookup(TENANT, 'whatsapp', '51999888777', now),
    ).toBeNull();

    await service.recordTouches(
      TENANT,
      CAMPAIGN,
      'phone',
      ['999888777'],
      new Date(now.getTime() - 5 * DAY),
    );
    expect(
      await service.lookup(TENANT, 'whatsapp', '51999888777', now),
    ).toMatchObject({
      kind: 'campaign',
      id: String(CAMPAIGN._id),
      name: 'Black Friday',
    });
    // Otra empresa o canal sin toques: nada.
    expect(
      await service.lookup(
        new Types.ObjectId().toString(),
        'whatsapp',
        '51999888777',
        now,
      ),
    ).toBeNull();
    expect(
      await service.lookup(TENANT, 'instagram', '51999888777', now),
    ).toBeNull();
  });
});
