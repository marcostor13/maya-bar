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
      expect(body.model).toBe('claude-haiku-4-5-20251001');
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
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 1024,
        messages: userMessages,
      });

      const { body } = lastFetchCall(fetchSpy);
      expect('system' in body).toBe(false);
      expect('temperature' in body).toBe(false);
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
});
