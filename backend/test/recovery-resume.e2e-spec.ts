import type { NestExpressApplication } from '@nestjs/platform-express';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { createApp, registerTenant } from './support/app';
import { Conversation } from '../src/conversations/conversation.schema';
import { Message } from '../src/conversations/message.schema';
import { RecoveryPlan } from '../src/recovery/recovery-plan.schema';
import { RecoveryAnalysisService } from '../src/recovery/recovery-analysis.service';
import { AiService } from '../src/ai/ai.service';

const TOTAL = 50; // 4 lotes de 15: el primer grupo (3 lotes en paralelo) se guarda; el 4.º falla.
const FAR = new Date(Date.now() + 3_600_000); // que el worker del cron no lo tome

/** Responde a la clasificación con un item por cada `id=` del prompt. */
function classifyReply(messages: { content: string }[]): string {
  const ids = [...messages[1].content.matchAll(/### id=([a-f0-9]{24})/g)].map(
    (m) => m[1],
  );
  return JSON.stringify({
    items: ids.map((id) => ({
      id,
      stage: 'interesado',
      note: `nota ${id.slice(-4)}`,
      name: '',
    })),
  });
}
const isClassify = (messages: { content: string }[]) =>
  messages[0]?.content.startsWith('Eres analista comercial');
const idsIn = (messages: { content: string }[]) =>
  [...messages[1].content.matchAll(/### id=([a-f0-9]{24})/g)].map((m) => m[1]);

describe('Recuperación: un reinicio no pierde lo ya clasificado (HU66 C2)', () => {
  let planId: Types.ObjectId;
  let allIds: string[];

  it('C2: el primer proceso guarda 45 clasificadas y cae; el segundo solo clasifica las 5 que faltan', async () => {
    // ── Proceso 1 ──
    let app: NestExpressApplication = await createApp();
    const owner = await registerTenant(app, 'Recupera');
    const tid = new Types.ObjectId(owner.user.tenantId!);
    const convs = app.get<Model<Conversation>>(
      getModelToken(Conversation.name),
    );
    const msgs = app.get<Model<Message>>(getModelToken(Message.name));
    const accountId = new Types.ObjectId();
    allIds = [];
    for (let i = 0; i < TOTAL; i++) {
      const at = new Date(Date.now() - (i + 1) * 3_600_000);
      const c = await convs.create({
        tenantId: tid,
        channel: 'whatsapp',
        accountId,
        contact: `5199900${String(i).padStart(4, '0')}`,
        status: 'open',
        autoReply: false,
        lastMessageAt: at,
      });
      await msgs.create({
        tenantId: tid,
        conversationId: c._id,
        direction: 'in',
        author: 'customer',
        type: 'text',
        text: `Hola, ¿precio? ${i}`,
        status: 'read',
        at,
      });
      allIds.push(String(c._id));
    }
    const plans = app.get<Model<RecoveryPlan>>(
      getModelToken(RecoveryPlan.name),
    );
    planId = (
      await plans.create({
        tenantId: tid,
        name: 'Prueba',
        status: 'analyzing',
        lookbackDays: 30,
        timezone: 'America/Lima',
        analysisAttempts: 0,
        analysisLockedUntil: FAR,
      })
    )._id;

    let classifyCalls = 0;
    const first = jest
      .spyOn(app.get(AiService), 'chatMessages')
      .mockImplementation((messages: { content: string }[]) => {
        if (!isClassify(messages))
          return Promise.reject(new Error('no aplica'));
        classifyCalls++;
        // El cuarto lote "se cae" (sus dos intentos).
        return classifyCalls <= 3
          ? Promise.resolve(classifyReply(messages))
          : Promise.reject(new Error('proceso caído'));
      });
    const plan1 = await plans.findById(planId).exec();
    await expect(app.get(RecoveryAnalysisService).run(plan1!)).rejects.toThrow(
      'lotes fallaron',
    );
    first.mockRestore();
    const saved = await plans
      .findById(planId)
      .select('+analysisCheckpoint')
      .lean<{
        analysisCheckpoint?: Record<string, { stage: string }>;
        analysis?: { processed: number };
      }>()
      .exec();
    expect(Object.keys(saved!.analysisCheckpoint ?? {})).toHaveLength(45);
    await app.close();

    // ── Proceso 2 (reinicio): otra instancia de la app sobre la misma base ──
    app = await createApp();
    const plans2 = app.get<Model<RecoveryPlan>>(
      getModelToken(RecoveryPlan.name),
    );
    const sent: string[][] = [];
    jest
      .spyOn(app.get(AiService), 'chatMessages')
      .mockImplementation((messages: { content: string }[]) => {
        if (!isClassify(messages))
          return Promise.reject(new Error('no aplica'));
        sent.push(idsIn(messages));
        return Promise.resolve(classifyReply(messages));
      });
    const plan2 = await plans2
      .findById(planId)
      .select('+analysisCheckpoint')
      .exec();
    await app.get(RecoveryAnalysisService).run(plan2!);

    // Solo se mandaron a la IA las 5 que faltaban, ninguna de las 45 guardadas.
    expect(sent).toHaveLength(1);
    const already = new Set(Object.keys(saved!.analysisCheckpoint ?? {}));
    expect(sent[0]).toHaveLength(5);
    expect(sent[0].some((id) => already.has(id))).toBe(false);

    const done = await plans2.findById(planId).lean<RecoveryPlan>().exec();
    expect(done!.status).toBe('review');
    const recipients = done!.segments.flatMap((s) => s.recipients);
    expect(recipients.map((r) => r.conversationId).sort()).toEqual(
      [...allIds].sort(),
    );
    // Las notas de las 45 del primer proceso se conservaron.
    const kept = recipients.find((r) => already.has(r.conversationId))!;
    expect(kept.note).toBe(`nota ${kept.conversationId.slice(-4)}`);
    await app.close();
  });
});
