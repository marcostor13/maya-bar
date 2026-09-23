import { Types } from 'mongoose';
import { DashboardAnalyticsService } from './dashboard-analytics.service';

type Pipeline = Record<string, any>[];

const TENANT = new Types.ObjectId().toString();
const USER = new Types.ObjectId().toString();
const AGENT = new Types.ObjectId();

const chain = (value: unknown) => {
  const q: any = {};
  for (const m of ['sort', 'limit', 'lean', 'select']) q[m] = () => q;
  q.exec = () => Promise.resolve(value);
  return q;
};

/** Modelo simulado: cada agregación responde según su forma. */
function model(opts: {
  count?: (filter: any) => number;
  aggregate?: (p: Pipeline) => unknown[];
  find?: (filter: any) => unknown[];
}) {
  return {
    countDocuments: jest.fn((f: any) => Promise.resolve(opts.count?.(f) ?? 0)),
    aggregate: jest.fn((p: Pipeline) =>
      Promise.resolve(opts.aggregate?.(p) ?? []),
    ),
    find: jest.fn((f: any) => chain(opts.find?.(f) ?? [])),
    collection: { name: 'conversations' },
  };
}

const groupId = (p: Pipeline) =>
  [...p].reverse().find((s) => s.$group)?.$group._id;
const isPrev = (f: any) => '$lt' in (f.createdAt ?? f.closedAt ?? f.at ?? {});

function setup(buckets: () => string[]) {
  const msg = model({
    aggregate: (p) => {
      const id = groupId(p);
      if (id?.b && id.k === '$author') {
        const [d1, d2] = buckets().slice(-2);
        return [
          { _id: { b: d1, k: 'customer' }, value: 10 },
          { _id: { b: d2, k: 'customer' }, value: 5 },
          { _id: { b: d2, k: 'agent' }, value: 6 },
          { _id: { b: d2, k: 'human' }, value: 2 },
        ];
      }
      if (id === '$author')
        return [
          { _id: 'customer', value: 10 },
          { _id: 'agent', value: 2 },
          { _id: 'human', value: 2 },
        ];
      if (id?.d)
        return [
          { _id: { d: 1, h: 9 }, value: 7 },
          { _id: { d: 7, h: 23 }, value: 1 },
        ];
      if (id === '$conv.channel')
        return [
          { _id: 'whatsapp', count: 12 },
          { _id: 'email', count: 3 },
        ];
      if (id === '$conv.agentId')
        return [{ _id: AGENT, replies: 6, conversations: 2 }];
      return [];
    },
    find: () => [
      {
        conversationId: 'c1',
        direction: 'in',
        author: 'customer',
        at: new Date('2026-09-20T10:00:00Z'),
      },
      {
        conversationId: 'c1',
        direction: 'out',
        author: 'agent',
        at: new Date('2026-09-20T10:02:00Z'),
      },
    ],
  });
  const customer = model({
    count: (f) => (isPrev(f) ? 4 : 0),
    aggregate: (p) => {
      const id = groupId(p);
      if (id?.$dateToString) return [{ _id: buckets().at(-1), value: 8 }];
      if (id === '$source')
        return [
          { _id: 'whatsapp', count: 5 },
          { _id: 'prospecting', count: 3 },
        ];
      if (id === '$tags') return [{ _id: 'VIP', count: 2 }];
      return [];
    },
  });
  const conv = model({
    count: (f) => (f.unreadCount ? 3 : f.escalated ? 1 : isPrev(f) ? 2 : 0),
    aggregate: (p) => {
      const id = groupId(p);
      if (id?.$dateToString) return [{ _id: buckets().at(-1), value: 4 }];
      if (id === '$agentId') return [{ _id: AGENT, count: 1 }];
      return [];
    },
    find: () => [{ _id: new Types.ObjectId() }],
  });
  const lead = model({
    count: (f) => {
      if (f.nextActionAt) return 2;
      if (f.status === 'lost') return isPrev(f) ? 1 : 1;
      return isPrev(f) ? 5 : 0;
    },
    aggregate: (p) => {
      const id = groupId(p);
      if (id?.s) {
        const last = buckets().at(-1);
        return [
          { _id: { b: last, s: 'won' }, value: 3000, count: 3 },
          { _id: { b: last, s: 'lost' }, value: 0, count: 1 },
        ];
      }
      if (id === null) return [{ value: 1000, count: 1 }];
      if (id?.$dateToString) return [{ _id: buckets().at(-1), value: 6 }];
      if (id === '$stage')
        return [
          { _id: 'new', count: 4, value: 1000 },
          { _id: 'proposal', count: 1, value: 2000 },
        ];
      if (id?.$ifNull) return [{ _id: 'Precio', count: 1 }];
      return [];
    },
  });
  const agent = model({
    find: () => [{ _id: AGENT, name: 'Asistente de ventas' }],
  });
  const campaign = model({
    aggregate: () => [
      { _id: 'whatsapp', sent: 2, recipients: 300 },
      { _id: 'email', sent: 1, recipients: 50 },
    ],
  });
  const submission = model({
    aggregate: () => [{ _id: new Types.ObjectId(), count: 9 }],
  });
  const form = model({ find: () => [] });
  const registration = model({
    aggregate: () => [{ registrations: 10, attendees: 18, checkedIn: 6 }],
  });
  const recovery = model({
    aggregate: () => [
      { _id: 'sent', count: 40 },
      { _id: 'failed', count: 2 },
    ],
  });
  const prospect = model({
    aggregate: () => [
      { found: 20, researched: 8, withMaterial: 4, contacted: 3, converted: 1 },
    ],
  });
  const suppression = model({ count: () => 2 });

  const service = new DashboardAnalyticsService(
    customer as never,
    conv as never,
    msg as never,
    agent as never,
    lead as never,
    campaign as never,
    submission as never,
    form as never,
    registration as never,
    recovery as never,
    prospect as never,
    suppression as never,
  );
  return { service, msg, customer, conv, lead };
}

describe('DashboardAnalyticsService', () => {
  let buckets: string[] = [];
  const run = (
    h: ReturnType<typeof setup>,
    query: Record<string, string> = {},
    role = 'TENANT_ADMIN',
  ) =>
    h.service
      .analytics(TENANT, USER, role, {
        range: '7d',
        tz: 'America/Lima',
        ...query,
      })
      .then((d) => {
        buckets = d.range.buckets;
        return d;
      });

  it('arma KPIs con periodo anterior, series por día y desgloses', async () => {
    // Las cubetas dependen de "hoy": se piden una vez y se reutilizan en los mocks.
    const probe = setup(() => buckets);
    buckets = (await run(probe)).range.buckets;
    const h = setup(() => buckets);
    const d = await run(h);

    expect(d.range.buckets).toHaveLength(7);
    expect(d.kpis.inbound.series.slice(-2)).toEqual([10, 5]);
    expect(d.kpis.inbound.value).toBe(15);
    expect(d.kpis.inbound.delta).toBe(50);
    expect(d.activity.ai.at(-1)).toBe(6);
    // Autonomía IA: 6 de 8 respuestas; antes 2 de 4.
    expect(d.kpis.aiShare).toMatchObject({
      value: 75,
      previous: 50,
      delta: 50,
    });

    expect(d.kpis.newContacts).toMatchObject({
      value: 8,
      previous: 4,
      delta: 100,
    });
    expect(d.kpis.newConversations).toMatchObject({
      value: 4,
      previous: 2,
      delta: 100,
    });
    expect(d.kpis.wonValue).toMatchObject({
      value: 3000,
      previous: 1000,
      delta: 200,
    });
    expect(d.kpis.wonDeals.value).toBe(3);
    // 3 ganadas y 1 perdida en el periodo.
    expect(d.kpis.conversionRate.value).toBe(75);
    expect(d.kpis.newLeads).toMatchObject({ value: 6, previous: 5 });

    // Embudo: solo etapas abiertas, en orden, con ponderado por probabilidad.
    expect(d.funnel.map((f) => f.key)).toEqual([
      'new',
      'contacted',
      'qualified',
      'proposal',
      'negotiation',
    ]);
    expect(d.pipeline).toEqual({
      open: 5,
      openValue: 3000,
      weightedValue: 1400,
    });
    expect(d.outcomes).toEqual({
      won: 3,
      lost: 1,
      lostSeries: [0, 0, 0, 0, 0, 0, 1],
      lostReasons: [{ key: 'Precio', label: 'Precio', count: 1 }],
    });

    // Mapa de calor: lunes 9 h y domingo 23 h.
    expect(d.heatmap).toHaveLength(7);
    expect(d.heatmap[0][9]).toBe(7);
    expect(d.heatmap[6][23]).toBe(1);

    expect(d.response).toMatchObject({ medianMinutes: 2, answered: 1 });
    expect(d.channels).toEqual([
      { key: 'whatsapp', label: 'WhatsApp', count: 12 },
      { key: 'email', label: 'Correo', count: 3 },
    ]);
    expect(d.sources[1]).toEqual({
      key: 'prospecting',
      label: 'Prospección',
      count: 3,
    });
    expect(d.agents).toEqual([
      {
        id: String(AGENT),
        name: 'Asistente de ventas',
        replies: 6,
        conversations: 2,
        handoffs: 1,
      },
    ]);
    expect(d.marketing.campaigns).toMatchObject({ sent: 3, recipients: 350 });
    expect(d.marketing.recovery).toEqual({ sent: 40, failed: 2 });
    expect(d.marketing.forms.submissions).toBe(9);
    expect(d.marketing.forms.top[0].label).toBe('Formulario eliminado');
    expect(d.marketing.events).toEqual({
      registrations: 10,
      attendees: 18,
      checkedIn: 6,
    });
    expect(d.marketing.suppression.added).toBe(2);
    expect(d.prospecting.found).toBe(20);
    expect(d.alerts).toEqual({ overdueTasks: 2, unread: 3, escalated: 1 });
  });

  it('todas las consultas van acotadas al tenant', async () => {
    const h = setup(() => buckets);
    await run(h);
    for (const m of [h.msg, h.customer, h.conv, h.lead]) {
      for (const [p] of m.aggregate.mock.calls as [Pipeline][])
        expect(String(p[0].$match.tenantId)).toBe(TENANT);
      for (const [f] of m.countDocuments.mock.calls as [any][])
        expect(String(f.tenantId)).toBe(TENANT);
    }
  });

  it('el filtro de canal acota mensajes, conversaciones y contactos', async () => {
    const h = setup(() => buckets);
    const d = await run(h, { channel: 'email' });
    expect(d.channel).toBe('email');
    expect(h.conv.find).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'email' }),
      { _id: 1 },
    );
    const msgMatches = (h.msg.aggregate.mock.calls as [Pipeline][]).map(
      ([p]) => p[0].$match,
    );
    // Todas menos la de canales (que desglosa todos) llevan la lista de conversaciones.
    expect(msgMatches.filter((m) => m.conversationId).length).toBe(
      msgMatches.length - 1,
    );
    const contactMatch = (
      h.customer.aggregate.mock.calls[0] as [Pipeline]
    )[0][0].$match;
    expect(contactMatch.source).toBe('email');
    // El desglose por canal solo deja el canal elegido.
    expect(d.channels.map((c) => c.key)).toEqual(['email']);
  });

  it('un impulsador solo ve sus oportunidades', async () => {
    const h = setup(() => buckets);
    await run(h, {}, 'IMPULSADOR');
    for (const [p] of h.lead.aggregate.mock.calls as [Pipeline][])
      expect(p[0].$match.$or).toEqual([
        { ownerId: new Types.ObjectId(USER) },
        { createdBy: new Types.ObjectId(USER) },
      ]);
  });

  it('ignora rangos y canales desconocidos', async () => {
    const h = setup(() => buckets);
    const d = await run(h, { range: 'siempre', channel: 'fax' });
    expect(d.range.key).toBe('30d');
    expect(d.channel).toBeNull();
    expect(h.conv.find).not.toHaveBeenCalled();
  });
});
