import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { PromptReviewService } from './prompt-review.service';
import { AgentGeneratorService } from './agent-generator.service';

const TENANT = new Types.ObjectId().toString();
const AGENT = new Types.ObjectId().toString();
const USER = new Types.ObjectId().toString();
const PROMPT = 'Eres Sofía.\nNunca des precios.';

const query = (result: unknown) => {
  const q: Record<string, jest.Mock> = {};
  for (const m of ['sort', 'limit', 'select', 'lean'])
    q[m] = jest.fn().mockReturnValue(q);
  q.exec = jest.fn().mockResolvedValue(result);
  return q;
};

function convDoc(over: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    escalated: false,
    lastMessageDirection: 'out',
    ...over,
  };
}

function build(opts: {
  convs?: ReturnType<typeof convDoc>[];
  aiReply?: string;
  review?: Record<string, unknown> | null;
  agentPrompt?: string;
  version?: { prompt: string; createdAt: Date } | null;
}) {
  const convModel = { find: jest.fn(() => query(opts.convs ?? [])) };
  const msgModel = {
    find: jest.fn(() =>
      query([
        { author: 'agent', text: 'Hola, ¿en qué te ayudo?' },
        { author: 'customer', text: '¿Cuánto cuesta? escríbeme a a@b.com' },
      ]),
    ),
  };
  const reviewModel = {
    create: jest.fn((d: unknown) => Promise.resolve(d)),
    find: jest.fn(() => query([])),
    findOne: jest.fn(() => query(opts.review ?? null)),
    findOneAndUpdate: jest.fn(() => query({ ...opts.review, updated: true })),
  };
  const agent = {
    _id: AGENT,
    systemPrompt: opts.agentPrompt ?? PROMPT,
    provider: 'auto',
    aiModel: '',
  };
  const agents = {
    findOne: jest.fn((id: string, tenant: string) =>
      id === AGENT && tenant === TENANT
        ? Promise.resolve(agent)
        : Promise.reject(new NotFoundException('Agente no encontrado')),
    ),
    getTenantApiKeys: jest.fn().mockResolvedValue({ openai: 'k' }),
    replacePrompt: jest.fn((p: { next: string }) =>
      Promise.resolve({ ...agent, systemPrompt: p.next }),
    ),
  };
  const versions = {
    list: jest.fn().mockResolvedValue([]),
    get: jest.fn(() =>
      opts.version
        ? Promise.resolve(opts.version)
        : Promise.reject(new NotFoundException('Versión no encontrada')),
    ),
  };
  const ai = {
    chatMessages: jest.fn().mockResolvedValue(opts.aiReply ?? '{}'),
    parseJson: jest.fn((t: string) => {
      try {
        return JSON.parse(t) as unknown;
      } catch {
        throw new BadRequestException('La IA devolvió una respuesta inválida');
      }
    }),
  };
  const service = new PromptReviewService(
    reviewModel as never,
    convModel as never,
    msgModel as never,
    agents as never,
    versions as never,
    ai as never,
  );
  return { service, convModel, msgModel, reviewModel, agents, versions, ai };
}

const reviewWith = (suggestions: Record<string, unknown>[]) => ({
  _id: new Types.ObjectId(),
  suggestions,
});

describe('PromptReviewService', () => {
  describe('analyze', () => {
    it('C1: lee solo conversaciones del agente y tenant en el periodo, prioriza derivadas y sin respuesta, máx. 30', async () => {
      const normal = Array.from({ length: 40 }, () => convDoc());
      const escalated = convDoc({ escalated: true });
      const unanswered = convDoc({ lastMessageDirection: 'in' });
      const convs = [...normal, unanswered, escalated];
      const reply = JSON.stringify({
        summary: 'Diagnóstico',
        suggestions: [
          {
            title: 'Precios',
            problem: 'Inventa precios',
            action: 'replace',
            find: 'Nunca des precios.',
            text: 'Nunca des precios; ofrece la llamada.',
            evidence: [{ conversationId: String(escalated._id), excerpt: 'x' }],
          },
        ],
      });
      const { service, convModel, msgModel, reviewModel, ai } = build({
        convs,
        aiReply: reply,
      });
      const before = Date.now();
      await service.analyze(TENANT, AGENT, USER, 7);

      const filter = (convModel.find.mock.calls[0] as unknown[])[0] as Record<
        string,
        unknown
      >;
      expect(String(filter.tenantId)).toBe(TENANT);
      expect(String(filter.agentId)).toBe(AGENT);
      expect(filter.inTrash).toEqual({ $ne: true });
      const since = (filter.lastMessageAt as { $gte: Date }).$gte.getTime();
      expect(before - since).toBeGreaterThanOrEqual(7 * 24 * 3600_000 - 1000);

      expect(msgModel.find).toHaveBeenCalledTimes(30);
      const firstConvs = msgModel.find.mock.calls
        .slice(0, 2)
        .map((c) =>
          String((c as [{ conversationId: unknown }])[0].conversationId),
        );
      expect(firstConvs).toEqual([
        String(escalated._id),
        String(unanswered._id),
      ]);

      const userMsg = (
        ai.chatMessages.mock.calls[0] as [{ role: string; content: string }[]]
      )[0][1].content;
      expect(userMsg).toContain(PROMPT);
      expect(userMsg).toContain('[correo]'); // C11
      expect(userMsg).not.toContain('a@b.com');

      const saved = (
        reviewModel.create.mock.calls[0] as [Record<string, unknown>]
      )[0];
      expect(saved).toMatchObject({
        days: 7,
        conversationsAnalyzed: 30,
        summary: 'Diagnóstico',
      });
      expect(saved.suggestions).toHaveLength(1);
    });

    it('C3: sin conversaciones en el periodo da error y no llama a la IA', async () => {
      const { service, ai } = build({ convs: [] });
      await expect(service.analyze(TENANT, AGENT, USER)).rejects.toThrow(
        BadRequestException,
      );
      expect(ai.chatMessages).not.toHaveBeenCalled();
    });

    it('C13: si la IA devuelve algo inválido, no guarda nada', async () => {
      const { service, reviewModel } = build({
        convs: [convDoc()],
        aiReply: 'no es json',
      });
      await expect(service.analyze(TENANT, AGENT, USER)).rejects.toThrow(
        BadRequestException,
      );
      expect(reviewModel.create).not.toHaveBeenCalled();
    });

    it('C13: si la IA falla, no guarda nada', async () => {
      const { service, reviewModel, ai } = build({ convs: [convDoc()] });
      ai.chatMessages.mockRejectedValue(new Error('timeout'));
      await expect(service.analyze(TENANT, AGENT, USER)).rejects.toThrow(
        'La IA tardó demasiado',
      );
      expect(reviewModel.create).not.toHaveBeenCalled();
    });

    it('C13: un timeout de la IA llega como un mensaje claro', async () => {
      const { service, ai } = build({ convs: [convDoc()] });
      ai.chatMessages.mockRejectedValue(
        new DOMException(
          'The operation was aborted due to timeout',
          'TimeoutError',
        ),
      );
      await expect(service.analyze(TENANT, AGENT, USER)).rejects.toThrow(
        'La IA tardó demasiado o no respondió',
      );
    });

    it('el resumen de la IA no deja pasar teléfonos ni correos (R12)', async () => {
      const { service, reviewModel } = build({
        convs: [convDoc()],
        aiReply: JSON.stringify({
          summary: 'El cliente 16572567174 escribió desde a@b.com',
          suggestions: [],
        }),
      });
      await service.analyze(TENANT, AGENT, USER);
      const saved = (
        reviewModel.create.mock.calls[0] as [{ summary: string }]
      )[0];
      expect(saved.summary).toBe(
        'El cliente [teléfono] escribió desde [correo]',
      );
    });

    it('C10: agente de otro tenant → 404 sin leer conversaciones', async () => {
      const { service, convModel } = build({ convs: [convDoc()] });
      await expect(
        service.analyze(new Types.ObjectId().toString(), AGENT, USER),
      ).rejects.toThrow(NotFoundException);
      expect(convModel.find).not.toHaveBeenCalled();
    });
  });

  describe('apply / discard', () => {
    const replace = {
      title: 'Precios',
      action: 'replace',
      find: 'Nunca des precios.',
      text: 'Nunca des precios; ofrece la llamada.',
      status: 'pending',
    };

    it('C4: aplica el cambio con reemplazo atómico, guarda versión y marca aplicada', async () => {
      const review = reviewWith([replace]);
      const { service, agents, reviewModel } = build({ review });
      const out = await service.apply(
        TENANT,
        AGENT,
        String(review._id),
        0,
        USER,
      );
      expect(agents.replacePrompt).toHaveBeenCalledWith({
        id: AGENT,
        tenantId: TENANT,
        expected: PROMPT,
        next: 'Eres Sofía.\nNunca des precios; ofrece la llamada.',
        source: 'suggestion',
        userId: USER,
        note: 'Precios',
      });
      expect(reviewModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: review._id, 'suggestions.0.status': 'pending' },
        { $set: { 'suggestions.0.status': 'applied' } },
        { new: true },
      );
      expect(out.agent.systemPrompt).toContain('ofrece la llamada');
    });

    it('C5: si el texto ya no está en el prompt, 409 y nada cambia', async () => {
      const review = reviewWith([replace]);
      const { service, agents, reviewModel } = build({
        review,
        agentPrompt: 'Prompt editado a mano',
      });
      await expect(
        service.apply(TENANT, AGENT, String(review._id), 0, USER),
      ).rejects.toThrow(ConflictException);
      expect(agents.replacePrompt).not.toHaveBeenCalled();
      expect(reviewModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('no aplica dos veces la misma sugerencia', async () => {
      const review = reviewWith([{ ...replace, status: 'applied' }]);
      const { service, agents } = build({ review });
      await expect(
        service.apply(TENANT, AGENT, String(review._id), 0, USER),
      ).rejects.toThrow(ConflictException);
      expect(agents.replacePrompt).not.toHaveBeenCalled();
    });

    it('C10: aplicar en un agente de otro tenant → 404 sin tocar nada', async () => {
      const review = reviewWith([replace]);
      const { service, agents } = build({ review });
      await expect(
        service.apply(
          new Types.ObjectId().toString(),
          AGENT,
          String(review._id),
          0,
          USER,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(agents.replacePrompt).not.toHaveBeenCalled();
    });

    it('índice inexistente → 404', async () => {
      const review = reviewWith([replace]);
      const { service } = build({ review });
      await expect(
        service.apply(TENANT, AGENT, String(review._id), 5, USER),
      ).rejects.toThrow(NotFoundException);
    });

    it('C6: descartar marca la sugerencia y no toca el prompt', async () => {
      const review = reviewWith([replace]);
      const { service, agents, reviewModel } = build({ review });
      await service.discard(TENANT, AGENT, String(review._id), 0);
      expect(reviewModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: review._id, 'suggestions.0.status': 'pending' },
        { $set: { 'suggestions.0.status': 'discarded' } },
        { new: true },
      );
      expect(agents.replacePrompt).not.toHaveBeenCalled();
    });

    it('C10: un análisis de otro tenant no se encuentra', async () => {
      const { service, reviewModel } = build({ review: null });
      await expect(
        service.discard(TENANT, AGENT, new Types.ObjectId().toString(), 0),
      ).rejects.toThrow(NotFoundException);
      const filter = (
        reviewModel.findOne.mock.calls[0] as [Record<string, unknown>]
      )[0];
      expect(String(filter.tenantId)).toBe(TENANT);
      expect(String(filter.agentId)).toBe(AGENT);
    });
  });

  describe('versiones', () => {
    it('C8: restaurar pone el texto de la versión y guarda el actual como restore', async () => {
      const { service, agents } = build({
        version: { prompt: 'Versión vieja', createdAt: new Date('2026-11-01') },
      });
      const vid = new Types.ObjectId().toString();
      await service.restore(TENANT, AGENT, vid, USER);
      expect(agents.replacePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          expected: PROMPT,
          next: 'Versión vieja',
          source: 'restore',
        }),
      );
    });

    it('restaurar la versión que ya es la actual da 400', async () => {
      const { service, agents } = build({
        version: { prompt: PROMPT, createdAt: new Date() },
      });
      await expect(
        service.restore(TENANT, AGENT, new Types.ObjectId().toString(), USER),
      ).rejects.toThrow(BadRequestException);
      expect(agents.replacePrompt).not.toHaveBeenCalled();
    });

    it('C10: listar versiones de un agente de otro tenant → 404', async () => {
      const { service, versions } = build({});
      await expect(
        service.listVersions(new Types.ObjectId().toString(), AGENT),
      ).rejects.toThrow(NotFoundException);
      expect(versions.list).not.toHaveBeenCalled();
    });
  });
});

describe('AgentGeneratorService', () => {
  const dto = {
    businessName: 'Farma Center',
    industry: 'Farmacia',
    offer: 'Medicamentos y delivery en Lima',
    goal: 'Vender y tomar pedidos',
    tone: 'cercano' as const,
    language: 'es' as const,
  };

  function gen(reply: string) {
    const ai = {
      chatMessages: jest.fn().mockResolvedValue(reply),
      parseJson: jest.fn((t: string) => JSON.parse(t) as unknown),
    };
    const agents = { getTenantApiKeys: jest.fn().mockResolvedValue({}) };
    return {
      ai,
      service: new AgentGeneratorService(ai as never, agents as never),
    };
  }

  it('C9: devuelve un borrador completo sin crear agentes', async () => {
    const prompt = '# Reglas\n' + 'x'.repeat(400);
    const { service, ai } = gen(
      JSON.stringify({
        name: 'Fara',
        description: 'Asistente de la farmacia',
        systemPrompt: prompt,
        greeting: '¡Hola!',
        handoffInstructions: 'Reclamos',
      }),
    );
    const draft = await service.generate(TENANT, dto);
    expect(draft).toEqual({
      name: 'Fara',
      description: 'Asistente de la farmacia',
      systemPrompt: prompt,
      greeting: '¡Hola!',
      handoffInstructions: 'Reclamos',
    });
    const user = (
      ai.chatMessages.mock.calls[0] as [{ content: string }[]]
    )[0][1].content;
    expect(user).toContain('Farma Center');
    expect(user).toContain('Idioma principal: español');
  });

  it('C13: un prompt demasiado corto es un error', async () => {
    const { service } = gen(JSON.stringify({ systemPrompt: 'corto' }));
    await expect(service.generate(TENANT, dto)).rejects.toThrow(
      BadRequestException,
    );
  });
});
