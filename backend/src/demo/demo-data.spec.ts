import { LEAD_STAGES } from '../leads/lead-stages.catalog';
import { buildDemoData, DEMO_EMAIL, DEMO_SLUG } from './demo-data';

const NOW = new Date('2026-11-26T15:00:00Z');
const DAY = 86_400_000;

describe('Datos de la demo (HU86 C4)', () => {
  const d = buildDemoData(NOW);
  const dates = (docs: Record<string, unknown>[], k: string) =>
    docs.map((x) => (x[k] as Date).getTime());

  it('es determinista con la misma fecha y semilla', () => {
    const a = buildDemoData(NOW);
    const b = buildDemoData(NOW);
    expect(a.customers.map((c) => c.name)).toEqual(
      b.customers.map((c) => c.name),
    );
    expect(a.leads.map((l) => [l.stage, l.value])).toEqual(
      b.leads.map((l) => [l.stage, l.value]),
    );
  });

  it('trae el volumen prometido y cubre las 7 etapas', () => {
    expect(d.users).toHaveLength(4);
    expect(d.customers.length).toBeGreaterThanOrEqual(30);
    expect(d.conversations.length).toBeGreaterThanOrEqual(30);
    expect(d.messages.length).toBeGreaterThan(d.conversations.length);
    expect(d.leads.length).toBeGreaterThanOrEqual(40);
    const stages = new Set(d.leads.map((l) => l.stage));
    for (const s of LEAD_STAGES) expect(stages.has(s.key)).toBe(true);
  });

  it('fechas dentro de los últimos 90 días (salvo próximas acciones)', () => {
    const min = NOW.getTime() - 90 * DAY;
    for (const t of [
      ...dates(d.customers, 'createdAt'),
      ...dates(d.leads, 'createdAt'),
      ...dates(d.messages, 'at'),
      ...dates(d.conversations, 'lastMessageAt'),
    ]) {
      expect(t).toBeGreaterThanOrEqual(min);
      expect(t).toBeLessThanOrEqual(NOW.getTime());
    }
  });

  it('solo datos ficticios: teléfonos 519000001xx y correos de demo.mayacrm.site', () => {
    for (const c of d.customers) {
      expect(String(c.phone)).toMatch(/^519000001\d\d$/);
      if (c.email) expect(c.email as string).toMatch(/@demo\.mayacrm\.site$/);
    }
    for (const u of d.users)
      expect(String(u.email)).toMatch(/@demo\.mayacrm\.site$/);
    expect(d.tenant).toMatchObject({
      slug: DEMO_SLUG,
      email: DEMO_EMAIL,
      demo: true,
    });
  });

  it('C5: sin cobros ni prueba: legacy, plan escala, sin trialEndsAt ni subscription', () => {
    expect(d.tenant).toMatchObject({ legacy: true, plan: 'escala' });
    expect(d.tenant.trialEndsAt).toBeUndefined();
    expect(d.tenant.subscription).toBeUndefined();
  });

  it('referencias coherentes: todo cuelga de la empresa y los mensajes de sus conversaciones', () => {
    const tid = d.tenant._id;
    const convIds = new Set(d.conversations.map((c) => String(c._id)));
    for (const m of d.messages) {
      expect(m.tenantId).toBe(tid);
      expect(convIds.has(String(m.conversationId))).toBe(true);
    }
    const custIds = new Set(d.customers.map((c) => String(c._id)));
    for (const l of d.leads)
      expect(custIds.has(String(l.customerId))).toBe(true);
    expect(d.conversations.some((c) => c.escalated)).toBe(true);
    expect(d.conversations.some((c) => (c.unreadCount as number) > 0)).toBe(
      true,
    );
  });
});
