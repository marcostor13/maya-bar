import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { AiAgentsService, normalizeHandoffTargets } from './ai-agents.service';
import { AiAgent } from './ai-agent.schema';
import { KnowledgeDoc } from './knowledge-doc.schema';
import { AgentFile } from './agent-file.schema';
import { TenantConfig } from '../settings/tenant-config.schema';
import { RagService } from './rag.service';
import { AiService } from '../ai/ai.service';
import { WooStoreService } from './store/woo-store.service';
import { LinksService } from '../links/links.service';
import { CalendarService } from '../calendar/calendar.service';
import { AgentBooking } from './calendar/agent-booking.schema';
import { PromptVersionsService } from './insights/prompt-versions.service';

const mockVersions = { record: jest.fn().mockResolvedValue(undefined) };

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

const mockStore = { search: jest.fn() };
const mockLinks = { createPersonalLinks: jest.fn() };
const mockCalendar = { busy: jest.fn(), createEvent: jest.fn() };

const dolopak = {
  id: 8667,
  nombre: 'Dolopak (Paracetamol 500mg) Tab – Caja x100un (B)',
  precio: 'S/ 40.00',
  precio_regular: null,
  disponible: true,
  stock_bajo: null,
  requiere_receta: false,
  link: 'https://farmacenter.com.pe/product/dolopak/',
  tiene_foto: true,
  precioNum: 40,
  moneda: 'S/',
  foto: 'https://farmacenter.com.pe/wp-content/uploads/dolopak-1024x768.png',
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
  let fileModel: any;
  let configModel: any;
  let bookingModel: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    agentModel = createMockModel();
    docModel = createMockModel();
    fileModel = createMockModel();
    configModel = createMockModel();
    bookingModel = createMockModel();
    bookingModel.countDocuments = jest.fn().mockReturnValue(buildQuery(0));

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
        { provide: getModelToken(AgentFile.name), useValue: fileModel },
        { provide: getModelToken(TenantConfig.name), useValue: configModel },
        { provide: RagService, useValue: mockRag },
        { provide: AiService, useValue: mockAi },
        { provide: WooStoreService, useValue: mockStore },
        { provide: LinksService, useValue: mockLinks },
        { provide: CalendarService, useValue: mockCalendar },
        { provide: getModelToken(AgentBooking.name), useValue: bookingModel },
        { provide: PromptVersionsService, useValue: mockVersions },
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

    it('limits history to the last 20 turns', async () => {
      const history = Array.from({ length: 25 }, (_, i) => ({
        role: 'user' as const,
        content: `msg ${i}`,
      }));
      await service.generateAnswer(makeAgent(), 'hola', history);

      const messages = mockAi.chatMessages.mock.calls[0][0];
      // 1 system + 20 history + 1 user actual
      expect(messages).toHaveLength(22);
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

    it('teaches the HANDOFF token only when handoff is enabled', async () => {
      await service.generateAnswer(makeAgent(), 'hola');
      expect(mockAi.chatMessages.mock.calls[0][0][0].content).not.toContain(
        '--- DERIVAR A UNA PERSONA ---',
      );

      await service.generateAnswer(
        makeAgent({
          handoffEnabled: true,
          handoffInstructions: 'el cliente reclama',
        }),
        'hola',
      );
      const system = mockAi.chatMessages.mock.calls[1][0][0].content;
      expect(system).toContain('--- DERIVAR A UNA PERSONA ---');
      expect(system).toContain('{{HANDOFF:motivo breve}}');
      expect(system).toContain(
        'Deriva especialmente cuando: el cliente reclama',
      );
    });

    it('extracts the HANDOFF token with its reason and cleans the text', async () => {
      mockAi.chatMessages.mockResolvedValue(
        'Te paso con una persona. {{HANDOFF:el cliente pide un humano}}',
      );

      const result = await service.generateAnswer(
        makeAgent({ handoffEnabled: true }),
        'quiero hablar con alguien',
      );

      expect(result.reply).toBe('Te paso con una persona.');
      expect(result.handoff).toEqual({ reason: 'el cliente pide un humano' });
    });

    it('accepts the HANDOFF token without reason and leaves the reply empty', async () => {
      mockAi.chatMessages.mockResolvedValue('{{HANDOFF}}');

      const result = await service.generateAnswer(
        makeAgent({ handoffEnabled: true }),
        'hola',
      );

      // Sin texto no se usa el fallback: el mensaje de derivación lo pone la conversación.
      expect(result.reply).toBe('');
      expect(result.handoff).toEqual({ reason: undefined });
    });

    it('strips the HANDOFF token even when handoff is disabled', async () => {
      mockAi.chatMessages.mockResolvedValue('texto {{HANDOFF:x}}');
      const result = await service.generateAnswer(makeAgent(), 'hola');

      // No se deriva, pero el token es sintaxis interna: un modelo puede
      // emitirlo por su cuenta y nunca debe llegar al cliente.
      expect(result.handoff).toBeNull();
      expect(result.reply).not.toContain('{{HANDOFF');
      expect(result.reply).toBe('texto');
    });

    describe('no responder (HU10)', () => {
      const FALLBACK = 'Lo siento, no puedo ayudarte con eso.';

      it('C1: enseña la marca solo cuando se permite callar', async () => {
        await service.generateAnswer(makeAgent(), 'hola');
        await service.generateAnswer(makeAgent(), 'hola', [], {
          allowSilence: true,
        });
        const sinPermiso = mockAi.chatMessages.mock.calls[0][0][0].content;
        const conPermiso = mockAi.chatMessages.mock.calls[1][0][0].content;
        expect(sinPermiso).not.toContain('--- NO RESPONDER ---');
        expect(conPermiso).toContain('--- NO RESPONDER ---');
        expect(conPermiso).toContain('{{NO_RESPONDER:motivo breve}}');
      });

      it('C2: con la marca devuelve silencio con motivo y sin respaldo', async () => {
        mockAi.chatMessages.mockResolvedValue(
          '{{NO_RESPONDER:promo de terceros}}',
        );
        const r = await service.generateAnswer(makeAgent(), 'promo', [], {
          allowSilence: true,
        });
        expect(r.silent).toEqual({ reason: 'promo de terceros' });
        expect(r.reply).toBe('');
        expect(r.filesToSend).toEqual([]);
      });

      it('C2: si escribe texto además de la marca, calla igual', async () => {
        mockAi.chatMessages.mockResolvedValue('¡Gracias! {{NO_RESPONDER}}');
        const r = await service.generateAnswer(makeAgent(), 'gracias', [], {
          allowSilence: true,
        });
        expect(r.silent).toEqual({ reason: 'sin motivo' });
        expect(r.reply).toBe('');
      });

      it('C3: una respuesta vacía sin marca usa el respaldo', async () => {
        mockAi.chatMessages.mockResolvedValue('  ');
        const r = await service.generateAnswer(makeAgent(), 'hola', [], {
          allowSilence: true,
        });
        expect(r.silent).toBeNull();
        expect(r.reply).toBe(FALLBACK);
      });

      it('C4: la derivación gana al silencio', async () => {
        mockAi.chatMessages.mockResolvedValue(
          'Te paso con alguien {{HANDOFF:x}} {{NO_RESPONDER:y}}',
        );
        const r = await service.generateAnswer(
          makeAgent({ handoffEnabled: true }),
          'quiero un humano',
          [],
          { allowSilence: true },
        );
        expect(r.silent).toBeNull();
        expect(r.handoff).toEqual({ reason: 'x' });
        expect(r.reply).toBe('Te paso con alguien');
      });

      it('enviar un archivo gana al silencio', async () => {
        fileModel.find.mockReturnValue(buildQuery([makeAgentFile()]));
        mockAi.chatMessages.mockResolvedValue(
          '{{SEND_FILE:carta}} {{NO_RESPONDER:x}}',
        );
        const r = await service.generateAnswer(makeAgent(), 'carta', [], {
          allowSilence: true,
        });
        expect(r.silent).toBeNull();
        expect(r.filesToSend).toHaveLength(1);
      });

      it('C5: sin permiso elimina la marca y responde con el texto', async () => {
        mockAi.chatMessages.mockResolvedValue('¡Con gusto! {{NO_RESPONDER:x}}');
        const r = await service.generateAnswer(makeAgent(), 'gracias');
        expect(r.silent).toBeNull();
        expect(r.reply).toBe('¡Con gusto!');
      });

      it('C5: sin permiso y solo la marca, usa el respaldo', async () => {
        mockAi.chatMessages.mockResolvedValue('{{NO_RESPONDER:x}}');
        const r = await service.generateAnswer(makeAgent(), 'promo');
        expect(r.silent).toBeNull();
        expect(r.reply).toBe(FALLBACK);
      });
    });

    it('propagates AiService errors', async () => {
      mockAi.chatMessages.mockRejectedValue(
        new BadRequestException('openai API error: boom'),
      );
      await expect(service.generateAnswer(makeAgent(), 'hola')).rejects.toThrow(
        'openai API error: boom',
      );
    });
  });

  // ─── tienda online ─────────────────────────────────────────────────────────

  describe('agenda (herramientas de calendario)', () => {
    const calAgent = (o: Record<string, unknown> = {}) =>
      makeAgent({
        name: 'Sofía',
        calendar: { enabled: true, timeZone: 'America/Lima' },
        ...o,
      });

    it('sin agenda activa no ofrece herramientas de calendario', async () => {
      await service.generateAnswer(
        makeAgent({ calendar: { enabled: false } }),
        'hola',
      );
      const [messages, opts] = mockAi.chatMessages.mock.calls[0];
      expect(opts.tools).toBeUndefined();
      expect(messages[0].content).not.toContain('AGENDA');
    });

    it('con agenda activa ofrece consultar y agendar, aunque no haya tienda', async () => {
      await service.generateAnswer(calAgent(), 'quiero una cita');
      const [messages, opts] = mockAi.chatMessages.mock.calls[0];
      expect(opts.tools.map((t: { name: string }) => t.name)).toEqual([
        'consultar_disponibilidad',
        'agendar_cita',
      ]);
      expect(messages[0].content).toContain('--- AGENDA');
      expect(messages[0].content).toContain('America/Lima');
    });

    it('con tienda y agenda combina las herramientas y enruta cada llamada', async () => {
      mockStore.search.mockResolvedValue([dolopak]);
      mockCalendar.busy.mockResolvedValue({
        provider: 'google',
        connectionId: 'c1',
        connectionEmail: 'a@b.pe',
        busy: [],
      });
      const results: any[] = [];
      mockAi.chatMessages.mockImplementation(
        async (_m: unknown, opts: { runTool: (c: any) => Promise<any> }) => {
          results.push(
            await opts.runTool({
              name: 'buscar_producto',
              input: { consulta: 'dolopak' },
            }),
          );
          results.push(
            await opts.runTool({ name: 'consultar_disponibilidad', input: {} }),
          );
          return 'listo';
        },
      );
      await service.generateAnswer(
        calAgent({ storeUrl: 'https://farmacenter.com.pe' }),
        'hola',
      );
      const opts = mockAi.chatMessages.mock.calls[0][1];
      expect(opts.tools.map((t: { name: string }) => t.name)).toEqual(
        expect.arrayContaining(['buscar_producto', 'agendar_cita']),
      );
      expect(results[0].productos).toHaveLength(1);
      expect(results[1].zona_horaria).toBe('America/Lima');
      expect(mockCalendar.busy).toHaveBeenCalledWith(
        String(tenantOid),
        undefined,
        expect.any(Date),
        expect.any(Date),
      );
    });

    it('con Gemini no activa la agenda (no ejecuta herramientas)', async () => {
      await service.generateAnswer(calAgent({ provider: 'gemini' }), 'cita');
      const [messages, opts] = mockAi.chatMessages.mock.calls[0];
      expect(opts.tools).toBeUndefined();
      expect(messages[0].content).not.toContain('--- AGENDA');
    });

    it('agendar desde una conversación crea el evento, lo registra y lo devuelve', async () => {
      const conv = new Types.ObjectId().toString();
      mockCalendar.busy.mockResolvedValue({
        provider: 'google',
        connectionId: new Types.ObjectId().toString(),
        connectionEmail: 'a@b.pe',
        busy: [],
      });
      mockCalendar.createEvent.mockResolvedValue({
        provider: 'google',
        eventId: 'ev-9',
        joinUrl: 'https://meet.google.com/x',
        start: '',
        end: '',
        connectionEmail: 'a@b.pe',
      });
      // Un horario válido: el próximo lunes a las 10:00 de Lima.
      const d = new Date(Date.now() + 8 * 86_400_000);
      while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
      const day = d.toISOString().slice(0, 10);
      mockAi.chatMessages.mockImplementation(
        async (_m: unknown, opts: { runTool: (c: any) => Promise<any> }) => {
          await opts.runTool({
            name: 'agendar_cita',
            input: { inicio: `${day}T10:00`, nombre: 'Ana' },
          });
          return 'Listo, agendado.';
        },
      );
      const res = await service.generateAnswer(
        calAgent(),
        'el lunes a las 10',
        [],
        {
          conversationId: conv,
          contactName: 'Ana',
          channel: 'whatsapp',
        },
      );
      expect(mockCalendar.createEvent).toHaveBeenCalled();
      expect(bookingModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending', title: 'Cita – Ana' }),
      );
      expect(bookingModel.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ start: expect.any(Date) }),
        {
          $set: expect.objectContaining({
            status: 'confirmed',
            eventId: 'ev-9',
          }),
        },
      );
      expect(res.bookings).toHaveLength(1);
      expect(res.bookings[0].joinUrl).toBe('https://meet.google.com/x');
    });

    it('rechaza una zona horaria inválida al guardar', () => {
      expect(() =>
        service.create(String(tenantOid), String(new Types.ObjectId()), {
          name: 'x',
          systemPrompt: 'y',
          calendar: {
            enabled: true,
            timeZone: 'Marte/Olimpo',
            durationMinutes: 30,
            hours: [{ day: 1, start: '09:00', end: '18:00' }],
            bufferMinutes: 0,
            minNoticeHours: 2,
            maxDaysAhead: 30,
            video: true,
            title: 'Cita',
          },
        } as any),
      ).toThrow(BadRequestException);
    });
  });

  describe('tienda online (herramientas)', () => {
    type Run = (c: {
      name: string;
      input: Record<string, unknown>;
    }) => Promise<any>;
    const storeAgent = (o: Record<string, unknown> = {}) =>
      makeAgent({ storeUrl: 'https://farmacenter.com.pe', ...o });

    /** Simula al modelo: ejecuta las llamadas indicadas y devuelve `reply`. */
    function modelCalls(
      calls: { name: string; input: Record<string, unknown> }[],
      reply = '',
      results: any[] = [],
    ) {
      mockAi.chatMessages.mockImplementation(
        async (_m: unknown, opts: { runTool: Run }) => {
          for (const c of calls) results.push(await opts.runTool(c));
          return reply;
        },
      );
      return results;
    }

    beforeEach(() => mockStore.search.mockResolvedValue([dolopak]));

    it('sin tienda no ofrece herramientas', async () => {
      await service.generateAnswer(makeAgent(), 'hola');
      expect(mockAi.chatMessages.mock.calls[0][1].tools).toBeUndefined();
    });

    it('con tienda ofrece las herramientas y las explica en el prompt', async () => {
      await service.generateAnswer(
        storeAgent({ handoffEnabled: true }),
        'hola',
      );
      const [messages, opts] = mockAi.chatMessages.mock.calls[0];
      expect(opts.tools.map((t: { name: string }) => t.name)).toEqual([
        'buscar_producto',
        'enviar_foto_producto',
        'generar_link_pago',
        'derivar_a_humano',
      ]);
      expect(messages[0].content).toContain('TIENDA ONLINE EN VIVO');
    });

    it('buscar_producto no le pasa al modelo la URL interna de la foto', async () => {
      const results = modelCalls(
        [{ name: 'buscar_producto', input: { consulta: 'dolopak' } }],
        'ok',
      );
      await service.generateAnswer(storeAgent(), 'dolopak?');
      expect(mockStore.search).toHaveBeenCalledWith(
        'https://farmacenter.com.pe',
        'dolopak',
      );
      expect(results[0].productos[0]).toMatchObject({
        id: 8667,
        precio: 'S/ 40.00',
        disponible: true,
      });
      expect(results[0].productos[0].foto).toBeUndefined();
    });

    it('si la web no responde devuelve el link de búsqueda', async () => {
      mockStore.search.mockRejectedValue(new Error('web_no_responde'));
      const results = modelCalls([
        { name: 'buscar_producto', input: { consulta: 'losartan 50' } },
      ]);
      await service.generateAnswer(storeAgent(), 'losartan');
      expect(results[0]).toEqual({
        error: 'web_no_responde',
        link_busqueda:
          'https://farmacenter.com.pe/?s=losartan%2050&post_type=product',
      });
    });

    it('con una foto, la respuesta viaja como su pie en un solo mensaje', async () => {
      const results = modelCalls(
        [
          { name: 'buscar_producto', input: { consulta: 'dolopak' } },
          { name: 'enviar_foto_producto', input: { producto_id: 8667 } },
          { name: 'enviar_foto_producto', input: { producto_id: 8667 } },
        ],
        'Dolopak S/ 40.00',
      );
      const r = await service.generateAnswer(storeAgent(), 'dolopak?');
      expect(results[1].enviado).toBe(true);
      expect(results[2]).toEqual({ enviado: false, motivo: 'ya_enviada' });
      expect(r.reply).toBe('');
      expect(r.filesToSend).toEqual([
        {
          url: dolopak.foto,
          name: dolopak.nombre,
          contentType: 'image/png',
          caption: 'Dolopak S/ 40.00',
        },
      ]);
    });

    it('con varias fotos, cada una lleva su nombre y la respuesta va aparte', async () => {
      mockStore.search.mockResolvedValue([
        dolopak,
        { ...dolopak, id: 2, nombre: 'Panadol', foto: 'https://x/p.jpg' },
      ]);
      modelCalls(
        [
          { name: 'buscar_producto', input: { consulta: 'paracetamol' } },
          { name: 'enviar_foto_producto', input: { producto_id: 8667 } },
          { name: 'enviar_foto_producto', input: { producto_id: 2 } },
        ],
        'Tenemos dos opciones',
      );
      const r = await service.generateAnswer(storeAgent(), 'paracetamol');
      expect(r.reply).toBe('Tenemos dos opciones');
      expect(
        r.filesToSend.map((f) => [f.name, f.caption, f.contentType]),
      ).toEqual([
        [dolopak.nombre, '', 'image/png'],
        ['Panadol', '', 'image/jpeg'],
      ]);
    });

    it('no envía la foto de un producto que no buscó', async () => {
      const results = modelCalls([
        { name: 'enviar_foto_producto', input: { producto_id: 1 } },
      ]);
      const r = await service.generateAnswer(storeAgent(), 'hola');
      expect(results[0].enviado).toBe(false);
      expect(r.filesToSend).toEqual([]);
    });

    it('link de pago nativo de WooCommerce para un producto', async () => {
      const results = modelCalls([
        { name: 'buscar_producto', input: { consulta: 'dolopak' } },
        {
          name: 'generar_link_pago',
          input: { items: [{ id: 8667, cantidad: 2 }] },
        },
      ]);
      await service.generateAnswer(storeAgent(), 'quiero 2', [], {
        channel: 'whatsapp',
      });
      expect(results[1]).toEqual({
        link: 'https://farmacenter.com.pe/checkout/?add-to-cart=8667&quantity=2&utm_source=agente_ia&utm_medium=whatsapp',
        resumen: [`2 × ${dolopak.nombre} – S/ 80.00`],
      });
    });

    it('link de pago con varios productos cuando la tienda tiene el snippet', async () => {
      mockStore.search.mockResolvedValue([
        dolopak,
        { ...dolopak, id: 8658, nombre: 'Panadol', precioNum: 12.5 },
      ]);
      const results = modelCalls([
        { name: 'buscar_producto', input: { consulta: 'paracetamol' } },
        {
          name: 'generar_link_pago',
          input: {
            items: [
              { id: 8667, cantidad: 2 },
              { id: 8658, cantidad: 1 },
            ],
          },
        },
      ]);
      await service.generateAnswer(
        storeAgent({ storeCartMode: 'multi' }),
        'los dos',
        [],
        { channel: 'whatsapp' },
      );
      expect(results[1].link).toBe(
        'https://farmacenter.com.pe/?fc_pedido=8667:2,8658:1&utm_source=agente_ia&utm_medium=whatsapp',
      );
      expect(results[1].resumen[1]).toBe('1 × Panadol – S/ 12.50');
    });

    it('rechaza el link de pago de un id no buscado o agotado', async () => {
      mockStore.search.mockResolvedValue([{ ...dolopak, disponible: false }]);
      const results = modelCalls([
        {
          name: 'generar_link_pago',
          input: { items: [{ id: 8667, cantidad: 1 }] },
        },
        { name: 'buscar_producto', input: { consulta: 'dolopak' } },
        {
          name: 'generar_link_pago',
          input: { items: [{ id: 8667, cantidad: 1 }] },
        },
      ]);
      await service.generateAnswer(storeAgent(), 'lo quiero');
      expect(results[0].error[0]).toContain('no salió de buscar_producto');
      expect(results[2].error[0]).toContain('agotado');
    });

    it('derivar_a_humano deriva con motivo y resumen', async () => {
      modelCalls(
        [
          {
            name: 'derivar_a_humano',
            input: { motivo: 'reclamo', resumen: 'Ana, pedido 123 no llegó' },
          },
        ],
        'Le comunico con un asesor.',
      );
      const r = await service.generateAnswer(
        storeAgent({ handoffEnabled: true }),
        'mi pedido no llega',
      );
      expect(r.handoff).toEqual({
        reason: 'reclamo: Ana, pedido 123 no llegó',
      });
      expect(r.reply).toBe('Le comunico con un asesor.');
    });

    it('acorta los links de la tienda y limpia el Markdown para el chat', async () => {
      let n = 0;
      mockLinks.createPersonalLinks.mockImplementation(() =>
        Promise.resolve([{ shortUrl: `https://api.mayacrm.site/l/c${++n}` }]),
      );
      const pay =
        'https://farmacenter.com.pe/checkout/?add-to-cart=8667&quantity=2&utm_source=agente_ia&utm_medium=whatsapp';
      modelCalls(
        [],
        `**Dolopak** listo.\n[Pagar aquí](${pay})\nO mira https://farmacenter.com.pe/producto/dolopak/. Otra web: https://google.com`,
      );
      const r = await service.generateAnswer(storeAgent(), 'pagar', [], {
        channel: 'whatsapp',
      });
      expect(r.reply).toBe(
        '*Dolopak* listo.\nPagar aquí: https://api.mayacrm.site/l/c1\nO mira https://api.mayacrm.site/l/c2. Otra web: https://google.com',
      );
      expect(mockLinks.createPersonalLinks).toHaveBeenCalledTimes(2);
      expect(mockLinks.createPersonalLinks.mock.calls[0][1]).toMatchObject({
        destination: pay,
        channel: 'whatsapp',
      });
    });

    it('si no se puede acortar, deja el link original', async () => {
      mockLinks.createPersonalLinks.mockRejectedValue(new Error('mongo caído'));
      modelCalls([], 'Pague aquí: https://farmacenter.com.pe/checkout/?x=1');
      const r = await service.generateAnswer(storeAgent(), 'pagar');
      expect(r.reply).toBe(
        'Pague aquí: https://farmacenter.com.pe/checkout/?x=1',
      );
    });

    it('no guarda una tienda que no sea https pública', async () => {
      await expect(
        service.update(agentOid.toString(), tenantOid.toString(), {
          storeUrl: 'http://localhost:3000',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('normaliza la URL de la tienda y la borra con vacío', async () => {
      agentModel.findOneAndUpdate.mockReturnValue(buildQuery(makeAgent()));
      await service.update(agentOid.toString(), tenantOid.toString(), {
        storeUrl: ' https://farmacenter.com.pe/tienda/ ',
      });
      expect(agentModel.findOneAndUpdate.mock.calls[0][1].$set.storeUrl).toBe(
        'https://farmacenter.com.pe',
      );
      await service.update(agentOid.toString(), tenantOid.toString(), {
        storeUrl: '',
      });
      expect(
        agentModel.findOneAndUpdate.mock.calls[1][1].$set.storeUrl,
      ).toBeNull();
    });
  });

  // ─── historial del prompt (HU8) ────────────────────────────────────────────

  describe('historial del prompt', () => {
    it('C7: al editar el prompt guarda la versión anterior como manual', async () => {
      agentModel.findOne.mockReturnValue(buildQuery(makeAgent()));
      agentModel.findOneAndUpdate.mockReturnValue(
        buildQuery(makeAgent({ systemPrompt: 'Nuevo' })),
      );
      await service.update(
        agentOid.toString(),
        tenantOid.toString(),
        { systemPrompt: 'Nuevo' },
        new Types.ObjectId().toString(),
      );
      expect(mockVersions.record).toHaveBeenCalledWith(
        expect.objectContaining({
          previous: 'Eres el asistente del bar.',
          source: 'manual',
        }),
      );
    });

    it('C7: si el prompt no cambia, o no viene, no guarda versión', async () => {
      agentModel.findOne.mockReturnValue(buildQuery(makeAgent()));
      agentModel.findOneAndUpdate.mockReturnValue(buildQuery(makeAgent()));
      await service.update(agentOid.toString(), tenantOid.toString(), {
        systemPrompt: 'Eres el asistente del bar.',
      });
      await service.update(agentOid.toString(), tenantOid.toString(), {
        name: 'Otro',
      });
      expect(mockVersions.record).not.toHaveBeenCalled();
    });

    it('replacePrompt cambia solo si el prompt sigue igual y guarda el anterior', async () => {
      agentModel.findOneAndUpdate.mockReturnValue(
        buildQuery(makeAgent({ systemPrompt: 'B' })),
      );
      await service.replacePrompt({
        id: agentOid.toString(),
        tenantId: tenantOid.toString(),
        expected: 'A',
        next: 'B',
        source: 'restore',
      });
      const [filter, update] = agentModel.findOneAndUpdate.mock.calls[0];
      expect(filter.systemPrompt).toBe('A');
      expect(update).toEqual({ $set: { systemPrompt: 'B' } });
      expect(mockVersions.record).toHaveBeenCalledWith(
        expect.objectContaining({ previous: 'A', source: 'restore' }),
      );
    });

    it('replacePrompt da 409 si el prompt cambió entre medio', async () => {
      agentModel.findOneAndUpdate.mockReturnValue(buildQuery(null));
      await expect(
        service.replacePrompt({
          id: agentOid.toString(),
          tenantId: tenantOid.toString(),
          expected: 'A',
          next: 'B',
          source: 'suggestion',
        }),
      ).rejects.toThrow(ConflictException);
      expect(mockVersions.record).not.toHaveBeenCalled();
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
      ).rejects.toThrow(new BadRequestException('No hay mensaje del usuario'));
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

    it('devuelve los archivos aparte, sin mezclarlos con el texto', async () => {
      fileModel.find.mockReturnValue(buildQuery([makeAgentFile()]));
      mockAi.chatMessages.mockResolvedValue('Te la envío {{SEND_FILE:carta}}');

      const result = await service.testChat(
        agentOid.toString(),
        tenantOid.toString(),
        [{ role: 'user', content: 'carta' }],
      );

      // La simulación va en su propio campo: pegada al texto parecía algo que
      // el agente le dice al cliente, que es justo lo que se está evaluando.
      expect(result.reply).toBe('Te la envío');
      expect(result.files).toEqual(['Carta del bar']);
      expect(result.reply).not.toContain('Se enviaría');
    });

    it('C8: si el agente calla, lo muestra como anotación y no como mensaje', async () => {
      mockAi.chatMessages.mockResolvedValue(
        '{{NO_RESPONDER:es una promoción}}',
      );
      const result = await service.testChat(
        agentOid.toString(),
        tenantOid.toString(),
        [
          { role: 'user', content: 'hola' },
          { role: 'assistant', content: 'buenas' },
          { role: 'user', content: 'Gran evento este sábado' },
        ],
      );
      expect(result.reply).toBe('');
      expect(result.files).toEqual([]);
      expect(result.silent).toEqual({ reason: 'es una promoción' });
      expect(mockAi.chatMessages.mock.calls[0][0][0].content).toContain(
        '--- NO RESPONDER ---',
      );
    });

    it('C8: tras un silencio no ofrece callar otra vez ni manda el turno vacío a la IA', async () => {
      await service.testChat(agentOid.toString(), tenantOid.toString(), [
        { role: 'user', content: 'hola' },
        { role: 'assistant', content: 'buenas' },
        { role: 'user', content: 'promo' },
        { role: 'assistant', content: '' },
        { role: 'user', content: 'gracias' },
      ]);
      const messages = mockAi.chatMessages.mock.calls[0][0];
      expect(messages[0].content).not.toContain('--- NO RESPONDER ---');
      expect(messages.some((m: { content: string }) => m.content === '')).toBe(
        false,
      );
    });

    it('C8: en el primer mensaje no ofrece callar', async () => {
      mockAi.chatMessages.mockResolvedValue('{{NO_RESPONDER:x}}');
      const result = await service.testChat(
        agentOid.toString(),
        tenantOid.toString(),
        [{ role: 'user', content: 'promo' }],
      );
      expect(result.reply).toBe('Lo siento, no puedo ayudarte con eso.');
      expect(result.files).toEqual([]);
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

describe('normalizeHandoffTargets', () => {
  const account = String(new Types.ObjectId());

  it('limpia teléfonos y correos y conserva la cuenta elegida', () => {
    expect(
      normalizeHandoffTargets([
        { channel: 'whatsapp', to: '+51 999 888 777', accountId: account },
        { channel: 'email', to: '  Jefa@X.pe ', accountId: account },
        { channel: 'sms', to: '51-911-111-111' },
      ]),
    ).toEqual([
      { channel: 'whatsapp', to: '51999888777', accountId: account },
      { channel: 'email', to: 'jefa@x.pe', accountId: account },
      { channel: 'sms', to: '51911111111' },
    ]);
  });

  it('descarta inválidos y repetidos del mismo canal, no entre canales', () => {
    expect(
      normalizeHandoffTargets([
        { channel: 'whatsapp', to: '123' },
        { channel: 'email', to: 'sin-arroba' },
        { channel: 'whatsapp', to: '51999888777' },
        { channel: 'whatsapp', to: '+51999888777' },
        { channel: 'sms', to: '51999888777' },
      ]),
    ).toEqual([
      { channel: 'whatsapp', to: '51999888777' },
      { channel: 'sms', to: '51999888777' },
    ]);
  });

  it('ignora una cuenta mal formada y la de un SMS', () => {
    expect(
      normalizeHandoffTargets([
        { channel: 'email', to: 'a@x.pe', accountId: 'no-es-un-id' },
        { channel: 'sms', to: '51999888777', accountId: account },
      ]),
    ).toEqual([
      { channel: 'email', to: 'a@x.pe' },
      { channel: 'sms', to: '51999888777' },
    ]);
  });

  it('sin lista devuelve vacío', () => {
    expect(normalizeHandoffTargets(undefined)).toEqual([]);
  });
});
