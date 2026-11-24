import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer } from '../customers/customer.schema';
import { ContactActivity } from '../customers/contact-activity.schema';
import { Lead } from '../leads/lead.schema';
import { Conversation } from '../conversations/conversation.schema';
import { Message } from '../conversations/message.schema';
import { MessageEvents } from '../conversations/message-events';
import { LeadStagesService } from '../leads/lead-stages.service';
import { AiService } from '../ai/ai.service';
import { emitAutomation } from '../automations/automation-bus';
import {
  heatOf,
  parseAiReading,
  ruleScore,
  SCORE_COOLDOWN_MS,
  scorePrompt,
  type AiReading,
} from './score-rules';

export interface ScoreResult {
  score: number;
  scoreLabel: 'hot' | 'warm' | 'cold';
  scoreReason: string;
  scoredAt: Date;
  skipped?: boolean;
}

/**
 * Puntaje de leads (HU70): reglas (origen, respuesta, emails, etapa) más una
 * lectura con IA de la última conversación. Se recalcula con cada mensaje
 * entrante, como mucho una vez cada 10 minutos por contacto, y cuesta créditos.
 */
@Injectable()
export class LeadScoringService implements OnModuleInit {
  private readonly logger = new Logger(LeadScoringService.name);

  constructor(
    @InjectModel(Customer.name) private customers: Model<Customer>,
    @InjectModel(ContactActivity.name)
    private activities: Model<ContactActivity>,
    @InjectModel(Lead.name) private leads: Model<Lead>,
    @InjectModel(Conversation.name) private convs: Model<Conversation>,
    @InjectModel(Message.name) private messages: Model<Message>,
    private stages: LeadStagesService,
    private ai: AiService,
    @Optional() private events?: MessageEvents,
  ) {}

  onModuleInit() {
    this.events?.on((kind, tenantId, msg) => {
      if (kind !== 'created' || msg.direction !== 'in') return;
      void this.onInbound(tenantId, msg).catch((err) =>
        this.logger.warn(`Puntaje: ${String(err)}`),
      );
    });
  }

  private async onInbound(tenantId: string, msg: Message) {
    const conv = await this.convs
      .findById(msg.conversationId)
      .select('customerId')
      .lean()
      .exec();
    if (conv?.customerId)
      await this.recalculate(tenantId, String(conv.customerId));
  }

  /**
   * Recalcula si pasó el intervalo; si no, devuelve el puntaje vigente. La
   * reserva es atómica: dos mensajes simultáneos no cobran dos veces.
   */
  async recalculate(
    tenantId: string,
    customerId: string,
  ): Promise<ScoreResult> {
    const tid = new Types.ObjectId(tenantId);
    const cid = new Types.ObjectId(customerId);
    const now = new Date();
    const claimed = await this.customers
      .findOneAndUpdate(
        {
          _id: cid,
          tenantId: tid,
          $or: [
            { scoredAt: { $exists: false } },
            { scoredAt: null },
            { scoredAt: { $lte: new Date(now.getTime() - SCORE_COOLDOWN_MS) } },
          ],
        },
        { $set: { scoredAt: now } },
        { new: false },
      )
      .lean<Customer>()
      .exec();
    if (!claimed) {
      const cur = await this.customers
        .findOne({ _id: cid, tenantId: tid })
        .select('score scoreLabel scoreReason scoredAt')
        .lean<Customer>()
        .exec();
      if (!cur) throw new NotFoundException('Contacto no encontrado');
      return {
        score: cur.score ?? 0,
        scoreLabel: cur.scoreLabel ?? 'cold',
        scoreReason: cur.scoreReason ?? '',
        scoredAt: cur.scoredAt ?? now,
        skipped: true,
      };
    }
    return this.compute(tenantId, claimed, now);
  }

  private async compute(
    tenantId: string,
    customer: Customer,
    now: Date,
  ): Promise<ScoreResult> {
    const tid = new Types.ObjectId(tenantId);
    const cid = customer._id;
    const since7 = new Date(now.getTime() - 7 * 86_400_000);
    const since30 = new Date(now.getTime() - 30 * 86_400_000);

    const [conv, opens, clicks, lead, stages] = await Promise.all([
      this.convs
        .findOne({ tenantId: tid, customerId: cid })
        .sort({ lastMessageAt: -1 })
        .select('_id')
        .lean()
        .exec(),
      this.activities.countDocuments({
        tenantId: tid,
        customerId: cid,
        type: 'email_open',
        createdAt: { $gte: since30 },
      }),
      this.activities.countDocuments({
        tenantId: tid,
        customerId: cid,
        type: 'email_click',
        createdAt: { $gte: since30 },
      }),
      this.leads
        .findOne({ tenantId: tid, customerId: cid })
        .sort({ lastActivityAt: -1 })
        .select('stage status')
        .lean<Lead>()
        .exec(),
      this.stages.list(tenantId),
    ]);

    const msgs = conv
      ? await this.messages
          .find({ conversationId: conv._id, author: { $ne: 'system' } })
          .sort({ at: -1 })
          .limit(30)
          .select('direction text at type')
          .lean<Message[]>()
          .exec()
      : [];
    msgs.reverse();

    const inboundRecent = msgs.filter(
      (m) => m.direction === 'in' && new Date(m.at) >= since7,
    ).length;
    let replyMinutes: number | undefined;
    for (let i = msgs.length - 1; i > 0; i--)
      if (msgs[i].direction === 'in' && msgs[i - 1].direction === 'out') {
        replyMinutes =
          (new Date(msgs[i].at).getTime() -
            new Date(msgs[i - 1].at).getTime()) /
          60_000;
        break;
      }

    const open = stages.filter((s) => !s.outcome);
    const idx = lead ? open.findIndex((s) => s.key === lead.stage) : -1;
    const rules = ruleScore({
      source: customer.source,
      inboundRecent,
      replyMinutes,
      emailOpens: opens,
      emailClicks: clicks,
      stageProgress:
        lead && idx >= 0 && open.length > 1 ? idx / (open.length - 1) : null,
      won: lead?.status === 'won',
    });

    const reading = await this.read(tenantId, msgs);
    const score = Math.min(100, rules.points + (reading?.points ?? 0));
    const scoreLabel = heatOf(score);
    const scoreReason =
      reading?.reason ||
      (rules.reasons.length
        ? cap(rules.reasons.join(', '))
        : 'Poca interacción todavía');

    await Promise.all([
      this.customers.updateOne(
        { _id: cid },
        {
          $set: {
            score,
            scoreLabel,
            scoreReason,
            scoredAt: now,
            scoreDetail: {
              rules: rules.points,
              ai: reading?.points ?? 0,
              intent: reading?.intent,
              budget: reading?.budget,
              urgency: reading?.urgency,
              objections: reading?.objections,
            },
          },
        },
      ),
      this.leads.updateMany(
        { tenantId: tid, customerId: cid },
        { $set: { score, scoreLabel, scoreReason } },
      ),
    ]);
    if (score !== (customer.score ?? -1))
      emitAutomation({
        type: 'score_changed',
        tenantId,
        customerId: String(cid),
        score,
        previous: customer.score ?? 0,
      });
    return { score, scoreLabel, scoreReason, scoredAt: now };
  }

  /** Lectura con IA de la conversación; sin conversación o si falla, nada. */
  private async read(
    tenantId: string,
    msgs: Pick<Message, 'direction' | 'text' | 'type'>[],
  ): Promise<AiReading | null> {
    const lines = msgs
      .filter((m) => m.text?.trim())
      .slice(-20)
      .map(
        (m) =>
          `${m.direction === 'in' ? 'Cliente' : 'Empresa'}: ${m.text.trim().slice(0, 500)}`,
      );
    if (!lines.some((l) => l.startsWith('Cliente'))) return null;
    try {
      const out = await this.ai.chat(scorePrompt(lines.join('\n')), {
        maxTokens: 300,
        temperature: 0,
        timeoutMs: 20_000,
        meter: { tenantId, action: 'scoring' },
      });
      return parseAiReading(out);
    } catch (err) {
      // Sin saldo o sin IA configurada: queda el puntaje por reglas.
      this.logger.warn(`Lectura IA del puntaje: ${String(err)}`);
      return null;
    }
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
