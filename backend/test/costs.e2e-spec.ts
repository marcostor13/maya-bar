import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import {
  Conversation,
  type ConversationChannel,
} from '../src/conversations/conversation.schema';
import { Message } from '../src/conversations/message.schema';
import { ApiSmsMessage } from '../src/api-access/api-access.schema';
import { Campaign } from '../src/campaigns/campaign.schema';
import { CampaignRecipient } from '../src/campaigns/campaign-recipient.schema';
import { signMetaBody } from '../src/shared/meta-signature';
import {
  bearer,
  createApp,
  createUser,
  registerTenant,
  type Session,
} from './support/app';

type Costs = {
  totalUsd: number;
  whatsapp: {
    usd: number;
    billed: number;
    free: number;
    byCategory: { category: string; count: number; usd: number }[];
  };
  sms: { segments: number; messages: number; usd: number | null };
  email: { sent: number; usd: number | null };
  instagram: { sent: number; usd: number };
};

describe('Costos de mensajes (HU18, e2e)', () => {
  let app: NestExpressApplication;
  let owner: Session;
  let other: Session;
  const http = () => request(app.getHttpServer());
  const model = <T>(name: string) => app.get<Model<T>>(getModelToken(name));

  beforeAll(async () => {
    app = await createApp();
    owner = await registerTenant(app, 'Costos');
    other = await registerTenant(app, 'Otra costos');
  });
  afterAll(async () => {
    await app.close();
  });

  async function ack(
    wamid: string,
    status: string,
    pricing?: Record<string, unknown>,
  ) {
    const raw = JSON.stringify({
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: 'pn-costos' },
                statuses: [
                  {
                    id: wamid,
                    status,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    recipient_id: '51999888777',
                    ...(pricing ? { pricing } : {}),
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    await http()
      .post('/wa/webhook/cloud')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', signMetaBody(raw, 'e2e-app-secret'))
      .send(raw)
      .expect(200);
  }

  async function seed(
    tenantId: string,
    channel: ConversationChannel,
    n: number,
    wamid?: string,
  ) {
    const conv = await model<Conversation>(Conversation.name).create({
      tenantId: new Types.ObjectId(tenantId),
      channel,
      accountId: new Types.ObjectId(),
      contact: '51999888777',
    });
    for (let i = 0; i < n; i++)
      await model<Message>(Message.name).create({
        tenantId: new Types.ObjectId(tenantId),
        conversationId: conv._id,
        direction: 'out',
        author: 'human',
        text: 'hola',
        status: 'sent',
        externalId: wamid ? `${wamid}-${i}` : undefined,
      });
  }

  const costs = async (s: Session = owner) =>
    (await http().get('/dashboard/costs?range=30d').set(bearer(s)).expect(200))
      .body as Costs;

  it('C2, C3, C4: WhatsApp por pricing de Meta; SMS y correo con y sin tarifa; aislado por empresa', async () => {
    const tid = owner.user.tenantId!;
    await seed(tid, 'whatsapp', 2, 'wamid.costos');
    await ack('wamid.costos-0', 'sent', {
      billable: true,
      pricing_model: 'PMP',
      type: 'regular',
      category: 'marketing',
    });
    // Un segundo pricing (delivered) no cambia ni duplica.
    await ack('wamid.costos-0', 'delivered', {
      type: 'regular',
      category: 'utility',
    });
    await ack('wamid.costos-1', 'delivered', {
      type: 'free_customer_service',
      category: 'service',
    });
    // El webhook responde 200 y procesa después: se espera al resultado.
    const priced = async () => {
      const end = Date.now() + 4000;
      for (;;) {
        const list = await model<Message>(Message.name)
          .find({ externalId: { $in: ['wamid.costos-0', 'wamid.costos-1'] } })
          .sort({ externalId: 1 })
          .lean();
        if (
          (list.every((m) => m.pricing) && list[0].status === 'delivered') ||
          Date.now() > end
        )
          return list;
        await new Promise((r) => setTimeout(r, 50));
      }
    };
    const [m0, m1] = await priced();
    expect(m0.pricing).toMatchObject({
      category: 'marketing',
      type: 'regular',
      market: 'Perú',
      usd: 0.0703,
    });
    expect(m0.status).toBe('delivered');
    expect(m1.pricing).toMatchObject({ type: 'free_customer_service', usd: 0 });

    await seed(tid, 'email', 3);
    await seed(tid, 'instagram', 2);
    await model<ApiSmsMessage>(ApiSmsMessage.name).create({
      tenantId: new Types.ObjectId(tid),
      accessId: new Types.ObjectId(),
      to: '+51999888777',
      text: 'x',
      segments: 2,
      status: 'sent',
    });
    const camp = await model<Campaign>(Campaign.name).create({
      tenantId: new Types.ObjectId(tid),
      name: 'SMS',
      type: 'sms',
      body: 'Hola',
    });
    await model<CampaignRecipient>(CampaignRecipient.name).create({
      tenantId: new Types.ObjectId(tid),
      campaignId: camp._id,
      customerId: new Types.ObjectId(),
      status: 'sent',
      sentAt: new Date(),
    });

    let c = await costs();
    expect(c.whatsapp).toMatchObject({ usd: 0.0703, billed: 1, free: 1 });
    expect(c.whatsapp.byCategory).toEqual([
      { category: 'marketing', count: 1, usd: 0.0703 },
    ]);
    expect(c.sms).toMatchObject({ segments: 3, messages: 2, usd: null });
    expect(c.email).toMatchObject({ sent: 3, usd: null });
    expect(c.instagram).toEqual({ sent: 2, usd: 0 });
    expect(c.totalUsd).toBe(0.0703);

    await http()
      .put('/dashboard/costs/settings')
      .set(bearer(owner))
      .send({ smsPerSegment: 11 })
      .expect(400);
    await http()
      .put('/dashboard/costs/settings')
      .set(bearer(owner))
      .send({ smsPerSegment: 0.05, emailPer1000: 1000 })
      .expect(200);
    // Un cambio parcial conserva la otra tarifa.
    await http()
      .put('/dashboard/costs/settings')
      .set(bearer(owner))
      .send({ smsPerSegment: 0.05 })
      .expect(200);
    c = await costs();
    expect(c.sms.usd).toBe(0.15);
    expect(c.email.usd).toBe(3);
    expect(c.totalUsd).toBe(3.2203);

    const foreign = await costs(other);
    expect(foreign.totalUsd).toBe(0);
    expect(foreign.email.sent).toBe(0);
  });

  it('C5: solo el administrador ve y cambia los costos', async () => {
    const marketing = await createUser(app, owner, 'MARKETING');
    await http().get('/dashboard/costs').set(bearer(marketing)).expect(403);
    await http()
      .put('/dashboard/costs/settings')
      .set(bearer(marketing))
      .send({ smsPerSegment: 0.01 })
      .expect(403);
  });
});
