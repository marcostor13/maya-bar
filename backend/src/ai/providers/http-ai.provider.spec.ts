import { BadRequestException } from '@nestjs/common';
import { HttpAiProvider } from './http-ai.provider';
import { ChatMessage } from './ai-provider.interface';

// ─── helpers ─────────────────────────────────────────────────────────────────

function mockResponse(body: unknown, ok = true, errText = 'boom') {
  return {
    ok,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(errText),
  } as unknown as Response;
}

function lastFetchCall(spy: jest.SpyInstance): {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
} {
  const [url, init] = spy.mock.calls[spy.mock.calls.length - 1];
  return {
    url: String(url),
    init: init as RequestInit,
    body: JSON.parse((init as RequestInit).body as string) as Record<
      string,
      unknown
    >,
  };
}

const userMessages: ChatMessage[] = [{ role: 'user', content: 'hola' }];

// ─── tests ───────────────────────────────────────────────────────────────────

describe('HttpAiProvider', () => {
  let provider: HttpAiProvider;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    provider = new HttpAiProvider();
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ─── deepseek / openai (OpenAI-compatible) ─────────────────────────────────

  describe('deepseek / openai', () => {
    it('calls DeepSeek endpoint with Bearer auth and default model', async () => {
      fetchSpy.mockResolvedValue(
        mockResponse({ choices: [{ message: { content: 'respuesta' } }] }),
      );

      const result = await provider.chat({
        provider: 'deepseek',
        apiKey: 'dk-key',
        maxTokens: 256,
        temperature: 0.4,
        messages: userMessages,
      });

      expect(result).toBe('respuesta');
      const { url, init, body } = lastFetchCall(fetchSpy);
      expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>).Authorization).toBe(
        'Bearer dk-key',
      );
      expect(body).toEqual({
        model: 'deepseek-v4-flash',
        max_tokens: 256,
        temperature: 0.4,
        messages: [{ role: 'user', content: 'hola' }],
      });
    });

    it('calls OpenAI endpoint with default model gpt-4o-mini', async () => {
      fetchSpy.mockResolvedValue(
        mockResponse({ choices: [{ message: { content: 'ok' } }] }),
      );

      await provider.chat({
        provider: 'openai',
        apiKey: 'sk-key',
        maxTokens: 100,
        temperature: 0.2,
        messages: userMessages,
      });

      const { url, body } = lastFetchCall(fetchSpy);
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(body.model).toBe('gpt-4o-mini');
    });

    it('respects explicit model and omits temperature when undefined (legacy body)', async () => {
      fetchSpy.mockResolvedValue(
        mockResponse({ choices: [{ message: { content: 'ok' } }] }),
      );

      await provider.chat({
        provider: 'deepseek',
        apiKey: 'dk',
        model: 'deepseek-chat',
        maxTokens: 1024,
        messages: userMessages,
      });

      const { body } = lastFetchCall(fetchSpy);
      expect(body.model).toBe('deepseek-chat');
      expect('temperature' in body).toBe(false);
    });

    it('sends max_completion_tokens to OpenAI and max_tokens a DeepSeek', async () => {
      fetchSpy.mockResolvedValue(
        mockResponse({ choices: [{ message: { content: 'ok' } }] }),
      );

      await provider.chat({
        provider: 'openai',
        apiKey: 'sk',
        maxTokens: 300,
        temperature: 0.4,
        messages: userMessages,
      });

      const { body } = lastFetchCall(fetchSpy);
      expect(body.max_completion_tokens).toBe(300);
      expect('max_tokens' in body).toBe(false);
      expect(body.temperature).toBe(0.4);
    });

    it('falls back to 1024 tokens when maxTokens comes null from the agent', async () => {
      fetchSpy.mockResolvedValue(
        mockResponse({ choices: [{ message: { content: 'ok' } }] }),
      );

      await provider.chat({
        provider: 'openai',
        apiKey: 'sk',
        maxTokens: null as unknown as number,
        messages: userMessages,
      });

      expect(lastFetchCall(fetchSpy).body.max_completion_tokens).toBe(1024);
    });

    it('omits temperature on OpenAI reasoning models (gpt-5, o-series)', async () => {
      fetchSpy.mockResolvedValue(
        mockResponse({ choices: [{ message: { content: 'ok' } }] }),
      );

      await provider.chat({
        provider: 'openai',
        apiKey: 'sk',
        model: 'gpt-5-mini',
        maxTokens: 300,
        temperature: 0.4,
        messages: userMessages,
      });

      expect('temperature' in lastFetchCall(fetchSpy).body).toBe(false);
    });

    it('returns empty string when response has no content', async () => {
      fetchSpy.mockResolvedValue(mockResponse({}));
      const result = await provider.chat({
        provider: 'openai',
        apiKey: 'k',
        maxTokens: 10,
        messages: userMessages,
      });
      expect(result).toBe('');
    });

    it('throws BadRequestException with default lowercase label on error', async () => {
      fetchSpy.mockResolvedValue(mockResponse({}, false, 'rate limited'));
      await expect(
        provider.chat({
          provider: 'deepseek',
          apiKey: 'k',
          maxTokens: 10,
          messages: userMessages,
        }),
      ).rejects.toThrow(
        new BadRequestException('deepseek API error: rate limited'),
      );
    });

    it('uses the custom errorLabel when provided (legacy messages)', async () => {
      fetchSpy.mockResolvedValue(mockResponse({}, false, 'bad key'));
      await expect(
        provider.chat({
          provider: 'openai',
          apiKey: 'k',
          maxTokens: 10,
          messages: userMessages,
          errorLabel: 'OpenAI',
        }),
      ).rejects.toThrow(new BadRequestException('OpenAI API error: bad key'));
    });
  });

  // ─── claude ────────────────────────────────────────────────────────────────

  describe('claude', () => {
    it('separates system messages and maps turns', async () => {
      fetchSpy.mockResolvedValue(
        mockResponse({ content: [{ text: 'hola humano' }] }),
      );

      const messages: ChatMessage[] = [
        { role: 'system', content: 'Eres útil.' },
        { role: 'system', content: 'Responde en español.' },
        { role: 'user', content: 'hola' },
        { role: 'assistant', content: 'buenas' },
        { role: 'user', content: 'qué tal' },
      ];

      const result = await provider.chat({
        provider: 'claude',
        apiKey: 'ck',
        maxTokens: 512,
        temperature: 0.3,
        messages,
      });

      expect(result).toBe('hola humano');
      const { url, init, body } = lastFetchCall(fetchSpy);
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      const headers = init.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('ck');
      expect(headers['anthropic-version']).toBe('2023-06-01');
      expect(body.model).toBe('claude-haiku-4-5');
      expect(body.max_tokens).toBe(512);
      expect(body.system).toBe('Eres útil.\n\nResponde en español.');
      expect(body.messages).toEqual([
        { role: 'user', content: 'hola' },
        { role: 'assistant', content: 'buenas' },
        { role: 'user', content: 'qué tal' },
      ]);
    });

    it('omits system and temperature when absent (legacy body)', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ content: [{ text: 'ok' }] }));

      await provider.chat({
        provider: 'claude',
        apiKey: 'ck',
        model: 'claude-haiku-4-5',
        maxTokens: 1024,
        messages: userMessages,
      });

      const { body } = lastFetchCall(fetchSpy);
      expect('system' in body).toBe(false);
      expect('temperature' in body).toBe(false);
    });

    it.each([
      ['claude-haiku-4-5', true],
      ['claude-sonnet-4-6', true],
      ['claude-opus-4-1-20250805', true],
      ['claude-opus-4-7', false],
      ['claude-opus-4-8', false],
      ['claude-sonnet-5', false],
      ['claude-opus-5', false],
      ['claude-sonnet-5-5', false],
      ['claude-haiku-5-5', false],
      ['claude-fable-5-1', false],
    ])('temperature en %s: se envía = %s', async (model, sent) => {
      fetchSpy.mockResolvedValue(mockResponse({ content: [{ text: 'ok' }] }));
      await provider.chat({
        provider: 'claude',
        apiKey: 'ck',
        model,
        maxTokens: 1024,
        temperature: 0.7,
        messages: userMessages,
      });
      expect('temperature' in lastFetchCall(fetchSpy).body).toBe(sent);
    });

    it('ignora el bloque thinking y une los bloques de texto', async () => {
      fetchSpy.mockResolvedValue(
        mockResponse({
          content: [
            { type: 'thinking', thinking: '' },
            { type: 'text', text: 'Hola, ' },
            { type: 'text', text: 'soy Fari.' },
          ],
        }),
      );
      const result = await provider.chat({
        provider: 'claude',
        apiKey: 'ck',
        model: 'claude-sonnet-5-5',
        maxTokens: 800,
        messages: userMessages,
      });
      expect(result).toBe('Hola, soy Fari.');
      expect(lastFetchCall(fetchSpy).body.max_tokens).toBe(2048);
    });

    it('throws BadRequestException with Claude label on error', async () => {
      fetchSpy.mockResolvedValue(mockResponse({}, false, 'overloaded'));
      await expect(
        provider.chat({
          provider: 'claude',
          apiKey: 'ck',
          maxTokens: 10,
          messages: userMessages,
        }),
      ).rejects.toThrow(
        new BadRequestException('Claude API error: overloaded'),
      );
    });
  });

  // ─── gemini ────────────────────────────────────────────────────────────────

  describe('gemini', () => {
    it('builds the generateContent URL and maps roles', async () => {
      fetchSpy.mockResolvedValue(
        mockResponse({
          candidates: [{ content: { parts: [{ text: 'gemini dice hola' }] } }],
        }),
      );

      const messages: ChatMessage[] = [
        { role: 'system', content: 'Eres útil.' },
        { role: 'user', content: 'hola' },
        { role: 'assistant', content: 'buenas' },
      ];

      const result = await provider.chat({
        provider: 'gemini',
        apiKey: 'gk',
        maxTokens: 200,
        temperature: 0.5,
        messages,
      });

      expect(result).toBe('gemini dice hola');
      const { url, body } = lastFetchCall(fetchSpy);
      expect(url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=gk',
      );
      expect(body.systemInstruction).toEqual({
        parts: [{ text: 'Eres útil.' }],
      });
      expect(body.contents).toEqual([
        { role: 'user', parts: [{ text: 'hola' }] },
        { role: 'model', parts: [{ text: 'buenas' }] },
      ]);
      expect(body.generationConfig).toEqual({
        temperature: 0.5,
        maxOutputTokens: 200,
      });
    });

    it('uses explicit model in the URL', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ candidates: [] }));
      await provider.chat({
        provider: 'gemini',
        apiKey: 'gk',
        model: 'gemini-2.5-pro',
        maxTokens: 10,
        messages: userMessages,
      });
      const { url } = lastFetchCall(fetchSpy);
      expect(url).toContain('/models/gemini-2.5-pro:generateContent');
    });

    it('throws BadRequestException with Gemini label on error', async () => {
      fetchSpy.mockResolvedValue(mockResponse({}, false, 'quota'));
      await expect(
        provider.chat({
          provider: 'gemini',
          apiKey: 'gk',
          maxTokens: 10,
          messages: userMessages,
        }),
      ).rejects.toThrow(new BadRequestException('Gemini API error: quota'));
    });
  });

  describe('chatWithTools', () => {
    const tools = [
      {
        name: 'buscar_producto',
        description: 'busca',
        parameters: { type: 'object', properties: {} },
      },
    ];
    const bodyOf = (i: number) =>
      JSON.parse(
        (fetchSpy.mock.calls[i] as [string, RequestInit])[1].body as string,
      ) as Record<string, any>;

    it('Claude: ejecuta las llamadas en paralelo y devuelve el turno con thinking', async () => {
      const thinking = { type: 'thinking', thinking: '', signature: 'sig' };
      fetchSpy
        .mockResolvedValueOnce(
          mockResponse({
            stop_reason: 'tool_use',
            content: [
              thinking,
              {
                type: 'tool_use',
                id: 't1',
                name: 'buscar_producto',
                input: { consulta: 'a' },
              },
              {
                type: 'tool_use',
                id: 't2',
                name: 'buscar_producto',
                input: { consulta: 'b' },
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          mockResponse({
            stop_reason: 'end_turn',
            content: [
              { type: 'thinking', thinking: '' },
              { type: 'text', text: 'listo' },
            ],
          }),
        );
      const runTool = jest
        .fn()
        .mockImplementation((c: { input: { consulta: string } }) =>
          c.input.consulta === 'b'
            ? Promise.reject(new Error('caída'))
            : Promise.resolve({ ok: c.input.consulta }),
        );

      const out = await provider.chatWithTools({
        provider: 'claude',
        apiKey: 'ck',
        model: 'claude-sonnet-5-5',
        maxTokens: 800,
        messages: [{ role: 'system', content: 'sys' }, ...userMessages],
        tools,
        runTool,
      });

      expect(out).toBe('listo');
      expect(runTool).toHaveBeenCalledTimes(2);
      const first = bodyOf(0);
      expect(first.tools[0]).toEqual({
        name: 'buscar_producto',
        description: 'busca',
        input_schema: { type: 'object', properties: {} },
      });
      expect(first.system).toEqual([
        { type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } },
      ]);
      const second = bodyOf(1);
      expect(second.messages[1]).toEqual({
        role: 'assistant',
        content: expect.arrayContaining([thinking]),
      });
      expect(second.messages[2].content).toEqual([
        { type: 'tool_result', tool_use_id: 't1', content: '{"ok":"a"}' },
        {
          type: 'tool_result',
          tool_use_id: 't2',
          content: '{"error":"caída"}',
          is_error: true,
        },
      ]);
    });

    it('Claude: al agotar las vueltas exige la respuesta sin herramientas', async () => {
      fetchSpy.mockResolvedValue(
        mockResponse({
          stop_reason: 'tool_use',
          content: [
            { type: 'tool_use', id: 't', name: 'buscar_producto', input: {} },
          ],
        }),
      );
      await provider.chatWithTools({
        provider: 'claude',
        apiKey: 'ck',
        maxTokens: 800,
        messages: userMessages,
        tools,
        runTool: jest.fn().mockResolvedValue({}),
        maxRounds: 1,
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(bodyOf(1).tool_choice).toEqual({ type: 'none' });
    });

    it('OpenAI: responde tool_calls con mensajes role=tool', async () => {
      fetchSpy
        .mockResolvedValueOnce(
          mockResponse({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: 'c1',
                      type: 'function',
                      function: {
                        name: 'buscar_producto',
                        arguments: '{"consulta":"x"}',
                      },
                    },
                  ],
                },
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          mockResponse({ choices: [{ message: { content: 'hecho' } }] }),
        );
      const runTool = jest.fn().mockResolvedValue({ productos: [] });

      const out = await provider.chatWithTools({
        provider: 'openai',
        apiKey: 'ok',
        model: 'gpt-5-mini',
        maxTokens: 800,
        messages: userMessages,
        tools,
        runTool,
      });

      expect(out).toBe('hecho');
      expect(runTool).toHaveBeenCalledWith({
        name: 'buscar_producto',
        input: { consulta: 'x' },
      });
      expect(bodyOf(0).tools[0].type).toBe('function');
      expect(bodyOf(1).messages.at(-1)).toEqual({
        role: 'tool',
        tool_call_id: 'c1',
        content: '{"productos":[]}',
      });
    });

    it('Gemini responde sin herramientas', async () => {
      fetchSpy.mockResolvedValue(
        mockResponse({ candidates: [{ content: { parts: [{ text: 'g' }] } }] }),
      );
      const runTool = jest.fn();
      const out = await provider.chatWithTools({
        provider: 'gemini',
        apiKey: 'gk',
        maxTokens: 100,
        messages: userMessages,
        tools,
        runTool,
      });
      expect(out).toBe('g');
      expect(runTool).not.toHaveBeenCalled();
    });
  });

  describe('listModels', () => {
    it('lists Claude models from the Anthropic endpoint', async () => {
      fetchSpy.mockResolvedValue(
        mockResponse({
          data: [{ id: 'claude-haiku-4-5' }, { id: 'claude-opus-5' }],
        }),
      );

      const ids = await provider.listModels('claude', 'ck');

      expect(ids).toEqual(['claude-haiku-4-5', 'claude-opus-5']);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(String(url)).toContain('https://api.anthropic.com/v1/models');
      expect(
        ((init as RequestInit).headers as Record<string, string>)['x-api-key'],
      ).toBe('ck');
    });

    it('keeps only Gemini models that can generate content', async () => {
      fetchSpy.mockResolvedValue(
        mockResponse({
          models: [
            {
              name: 'models/gemini-2.5-flash',
              supportedGenerationMethods: ['generateContent'],
            },
            {
              name: 'models/text-embedding-004',
              supportedGenerationMethods: ['embedContent'],
            },
          ],
        }),
      );

      expect(await provider.listModels('gemini', 'gk')).toEqual([
        'gemini-2.5-flash',
      ]);
    });

    it('returns an empty list without an API key, without calling the network', async () => {
      expect(await provider.listModels('openai', '')).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
