import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AiAgentsService } from './ai-agents.service';
import { AiAgent } from './ai-agent.schema';
import { KnowledgeDoc } from './knowledge-doc.schema';
import { AgentConversation } from './agent-conversation.schema';
import { AgentFile } from './agent-file.schema';
import { TenantConfig } from '../settings/tenant-config.schema';
import { RagService } from './rag.service';
import { AiService } from '../ai/ai.service';

// ─── helpers ─────────────────────────────────────────────────────────────────

const tenantOid = new Types.ObjectId();
const agentOid = new Types.ObjectId();

const mockRag = {
  retrieve: jest.fn(),
  deleteByAgent: jest.fn(),
  deleteByDoc: jest.fn(),
  ingest: jest.fn(),
};

const mockAi = {
  chatMessages: jest.fn(),
};

function buildQuery(result: unknown) {
  const q = {
    sort: jest.fn(),
    exec: jest.fn().mockResolvedValue(result),
  };
  q.sort.mockReturnValue(q);
  return q;
}

function createMockModel() {
  const model: any = jest.fn();
  model.find = jest.fn().mockReturnValue(buildQuery([]));
  model.findOne = jest.fn().mockReturnValue(buildQuery(null));
  model.findOneAndUpdate = jest.fn().mockReturnValue(buildQuery(null));
  model.create = jest.fn();
  model.updateOne = jest.fn().mockReturnValue(buildQuery(null));
  model.deleteOne = jest.fn().mockReturnValue(buildQuery(null));
  model.deleteMany = jest.fn().mockReturnValue(buildQuery(null));
  return model;
}

function makeAgent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: agentOid,
    tenantId: tenantOid,
    systemPrompt: 'Eres el asistente del bar.',
    ragEnabled: false,
    topK: 3,
    provider: 'auto',
    aiModel: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 512,
    fallbackMessage: 'Lo siento, no puedo ayudarte con eso.',
    ...overrides,
  } as any;
}

function makeAgentFile(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    alias: 'carta',
    name: 'Carta del bar',
    filename: 'carta.pdf',
    url: 'https://files.test/carta.pdf',
    contentType: 'application/pdf',
    ...overrides,
  } as any;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('AiAgentsService', () => {
  let service: AiAgentsService;
  let agentModel: any;
  let docModel: any;
  let convModel: any;
  let fileModel: any;
  let configModel: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    agentModel = createMockModel();
    docModel = createMockModel();
    convModel = createMockModel();
    fileModel = createMockModel();
    configModel = createMockModel();

    mockRag.retrieve.mockResolvedValue([]);
    mockAi.chatMessages.mockResolvedValue('respuesta del agente');
    configModel.findOne.mockReturnValue(
      buildQuery({ openaiApiKey: 'tenant-openai' }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiAgentsService,
        { provide: getModelToken(AiAgent.name), useValue: agentModel },
        { provide: getModelToken(KnowledgeDoc.name), useValue: docModel },
        {
          provide: getModelToken(AgentConversation.name),
          useValue: convModel,
        },
        { provide: getModelToken(AgentFile.name), useValue: fileModel },
        { provide: getModelToken(TenantConfig.name), useValue: configModel },
        { provide: RagService, useValue: mockRag },
        { provide: AiService, useValue: mockAi },
      ],
    }).compile();

    service = module.get<AiAgentsService>(AiAgentsService);
  });

  // ─── findOne ───────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the agent when found', async () => {
      const agent = makeAgent();
      agentModel.findOne.mockReturnValue(buildQuery(agent));
      const result = await service.findOne(
        agentOid.toString(),
        tenantOid.toString(),
      );
      expect(result).toBe(agent);
    });

    it('throws NotFoundException when missing', async () => {
      await expect(
        service.findOne(agentOid.toString(), tenantOid.toString()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── generateAnswer ────────────────────────────────────────────────────────

  describe('generateAnswer', () => {
    it('builds the messages and forwards agent params and tenant keys to AiService', async () => {
      const agent = makeAgent();
      const result = await service.generateAnswer(agent, 'hola');

      expect(result.reply).toBe('respuesta del agente');
      expect(result.sources).toBe(0);
      expect(result.filesToSend).toEqual([]);

      expect(mockAi.chatMessages).toHaveBeenCalledTimes(1);
      const [messages, options] = mockAi.chatMessages.mock.calls[0];

      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain('Eres el asistente del bar.');
      expect(messages[messages.length - 1]).toEqual({
        role: 'user',
        content: 'hola',
      });

      expect(options).toEqual({
        provider: 'auto',
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 512,
        apiKeys: {
          openai: 'tenant-openai',
          deepseek: undefined,
          gemini: undefined,
          claude: undefined,
        },
      });
    });

    it('does not call RAG when ragEnabled is false', async () => {
      await service.generateAnswer(makeAgent({ ragEnabled: false }), 'hola');
      expect(mockRag.retrieve).not.toHaveBeenCalled();
    });

    it('injects retrieved chunks into the system prompt when ragEnabled', async () => {
      mockRag.retrieve.mockResolvedValue([
        { text: 'Horario: 9 a 18' },
        { text: 'Cerramos lunes' },
      ]);
      const agent = makeAgent({ ragEnabled: true, topK: 3 });

      const result = await service.generateAnswer(agent, '¿horario?');

      expect(mockRag.retrieve).toHaveBeenCalledWith(
        String(tenantOid),
        String(agentOid),
        '¿horario?',
        3,
      );
      expect(result.sources).toBe(2);
      const system = mockAi.chatMessages.mock.calls[0][0][0].content;
      expect(system).toContain('--- BASE DE CONOCIMIENTO ---');
      expect(system).toContain('[Fragmento 1]\nHorario: 9 a 18');
      expect(system).toContain('[Fragmento 2]\nCerramos lunes');
    });

    it('notes when RAG is enabled but nothing is retrieved', async () => {
      mockRag.retrieve.mockResolvedValue([]);
      await service.generateAnswer(makeAgent({ ragEnabled: true }), 'hola');
      const system = mockAi.chatMessages.mock.calls[0][0][0].content;
      expect(system).toContain(
        'No hay información relevante en la base de conocimiento',
      );
    });

    it('limits history to the last 10 turns', async () => {
      const history = Array.from({ length: 15 }, (_, i) => ({
        role: 'user' as const,
        content: `msg ${i}`,
      }));
      await service.generateAnswer(makeAgent(), 'hola', history);

      const messages = mockAi.chatMessages.mock.calls[0][0];
      // 1 system + 10 history + 1 user actual
      expect(messages).toHaveLength(12);
      expect(messages[1].content).toBe('msg 5');
    });

    it('uses the fallback message when the AI reply is empty', async () => {
      mockAi.chatMessages.mockResolvedValue('   ');
      const result = await service.generateAnswer(makeAgent(), 'hola');
      expect(result.reply).toBe('Lo siento, no puedo ayudarte con eso.');
    });

    it('advertises sendable files in the system prompt', async () => {
      fileModel.find.mockReturnValue(buildQuery([makeAgentFile()]));
      await service.generateAnswer(makeAgent(), 'hola');
      const system = mockAi.chatMessages.mock.calls[0][0][0].content;
      expect(system).toContain('--- ARCHIVOS QUE PUEDES ENVIAR ---');
      expect(system).toContain(
        '{{SEND_FILE:carta}} → Carta del bar (carta.pdf)',
      );
    });

    it('extracts SEND_FILE tokens into filesToSend and cleans the text', async () => {
      fileModel.find.mockReturnValue(buildQuery([makeAgentFile()]));
      mockAi.chatMessages.mockResolvedValue(
        'Aquí tienes la carta {{SEND_FILE:carta}}',
      );

      const result = await service.generateAnswer(makeAgent(), 'la carta');

      expect(result.reply).toBe('Aquí tienes la carta');
      expect(result.filesToSend).toEqual([
        {
          url: 'https://files.test/carta.pdf',
          contentType: 'application/pdf',
          name: 'Carta del bar',
        },
      ]);
    });

    it('ignores tokens with unknown alias and deduplicates repeats', async () => {
      fileModel.find.mockReturnValue(buildQuery([makeAgentFile()]));
      mockAi.chatMessages.mockResolvedValue(
        '{{SEND_FILE:carta}} {{SEND_FILE:carta}} {{SEND_FILE:otro}} listo',
      );

      const result = await service.generateAnswer(makeAgent(), 'hola');

      expect(result.filesToSend).toHaveLength(1);
      expect(result.reply).not.toContain('SEND_FILE');
    });

    it('falls back when the reply only contained tokens', async () => {
      fileModel.find.mockReturnValue(buildQuery([makeAgentFile()]));
      mockAi.chatMessages.mockResolvedValue('{{SEND_FILE:carta}}');

      const result = await service.generateAnswer(makeAgent(), 'hola');

      expect(result.filesToSend).toHaveLength(1);
      expect(result.reply).toBe('Lo siento, no puedo ayudarte con eso.');
    });

    it('propagates AiService errors', async () => {
      mockAi.chatMessages.mockRejectedValue(
        new BadRequestException('openai API error: boom'),
      );
      await expect(
        service.generateAnswer(makeAgent(), 'hola'),
      ).rejects.toThrow('openai API error: boom');
    });
  });

  // ─── testChat ──────────────────────────────────────────────────────────────

  describe('testChat', () => {
    beforeEach(() => {
      agentModel.findOne.mockReturnValue(buildQuery(makeAgent()));
    });

    it('throws when there is no user message', async () => {
      await expect(
        service.testChat(agentOid.toString(), tenantOid.toString(), [
          { role: 'assistant', content: 'hola' },
        ]),
      ).rejects.toThrow(
        new BadRequestException('No hay mensaje del usuario'),
      );
    });

    it('answers using the last user message and prior history', async () => {
      const result = await service.testChat(
        agentOid.toString(),
        tenantOid.toString(),
        [
          { role: 'user', content: 'hola' },
          { role: 'assistant', content: 'buenas' },
          { role: 'user', content: '¿precio?' },
        ],
      );

      expect(result.reply).toBe('respuesta del agente');
      const messages = mockAi.chatMessages.mock.calls[0][0];
      expect(messages[messages.length - 1]).toEqual({
        role: 'user',
        content: '¿precio?',
      });
      // historial previo incluido entre system y el mensaje actual
      expect(messages).toHaveLength(4);
    });

    it('appends a note for each file that would be sent', async () => {
      fileModel.find.mockReturnValue(buildQuery([makeAgentFile()]));
      mockAi.chatMessages.mockResolvedValue('Te la envío {{SEND_FILE:carta}}');

      const result = await service.testChat(
        agentOid.toString(),
        tenantOid.toString(),
        [{ role: 'user', content: 'carta' }],
      );

      expect(result.reply).toContain('Te la envío');
      expect(result.reply).toContain('[Se enviaría archivo: Carta del bar]');
    });
  });

  // ─── resolveMediaType ──────────────────────────────────────────────────────

  describe('resolveMediaType', () => {
    it('maps content types to media types', () => {
      expect(AiAgentsService.resolveMediaType('image/png')).toBe('image');
      expect(AiAgentsService.resolveMediaType('video/mp4')).toBe('video');
      expect(AiAgentsService.resolveMediaType('audio/ogg')).toBe('audio');
      expect(AiAgentsService.resolveMediaType('application/pdf')).toBe(
        'document',
      );
      expect(AiAgentsService.resolveMediaType(undefined)).toBe('document');
    });
  });
});
