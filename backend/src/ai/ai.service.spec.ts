import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { AI_CHAT_PROVIDER } from './providers/ai-provider.interface';

// ─── helpers ─────────────────────────────────────────────────────────────────

const mockProvider = { chat: jest.fn() };

async function makeService(
  env: Record<string, string> = {},
): Promise<AiService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AiService,
      {
        provide: ConfigService,
        useValue: { get: jest.fn((key: string) => env[key]) },
      },
      { provide: AI_CHAT_PROVIDER, useValue: mockProvider },
    ],
  }).compile();
  return module.get<AiService>(AiService);
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('AiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProvider.chat.mockResolvedValue('respuesta IA');
  });

  // ─── chat (prompt simple, keys de entorno) ─────────────────────────────────

  describe('chat', () => {
    it('uses DeepSeek in auto mode when DEEPSEEK_API_KEY is set', async () => {
      const service = await makeService({ DEEPSEEK_API_KEY: 'dk' });
      const result = await service.chat('hola');

      expect(result).toBe('respuesta IA');
      expect(mockProvider.chat).toHaveBeenCalledWith({
        provider: 'deepseek',
        apiKey: 'dk',
        model: 'deepseek-chat',
        maxTokens: 1024,
        messages: [{ role: 'user', content: 'hola' }],
        errorLabel: 'DeepSeek',
      });
    });

    it('falls back to Claude in auto mode when only CLAUDE_API_KEY is set', async () => {
      const service = await makeService({ CLAUDE_API_KEY: 'ck' });
      await service.chat('hola', { maxTokens: 300 });

      expect(mockProvider.chat).toHaveBeenCalledWith({
        provider: 'claude',
        apiKey: 'ck',
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 300,
        messages: [{ role: 'user', content: 'hola' }],
        errorLabel: 'Claude',
      });
    });

    it('falls back to OpenAI in auto mode when only OPENAI_API_KEY is set', async () => {
      const service = await makeService({ OPENAI_API_KEY: 'ok' });
      await service.chat('hola');

      expect(mockProvider.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'openai',
          apiKey: 'ok',
          model: 'gpt-4o-mini',
          errorLabel: 'OpenAI',
        }),
      );
    });

    it('throws when an explicit provider has no key configured', async () => {
      const service = await makeService({ DEEPSEEK_API_KEY: 'dk' });
      await expect(service.chat('x', { provider: 'openai' })).rejects.toThrow(
        new BadRequestException('OPENAI_API_KEY no configurada'),
      );
      expect(mockProvider.chat).not.toHaveBeenCalled();
    });

    it('throws when no key is configured at all', async () => {
      const service = await makeService();
      await expect(service.chat('x')).rejects.toThrow(
        new BadRequestException(
          'No hay API key de IA configurada (DEEPSEEK_API_KEY, CLAUDE_API_KEY o OPENAI_API_KEY)',
        ),
      );
    });
  });

  // ─── chatMessages (historial + keys por-tenant) ────────────────────────────

  describe('chatMessages', () => {
    const messages = [
      { role: 'system' as const, content: 'Eres útil.' },
      { role: 'user' as const, content: 'hola' },
    ];

    it('passes defaults (maxTokens 1024, temperature 0.4) and env key', async () => {
      const service = await makeService({ OPENAI_API_KEY: 'ok' });
      const result = await service.chatMessages(messages);

      expect(result).toBe('respuesta IA');
      expect(mockProvider.chat).toHaveBeenCalledWith({
        provider: 'openai',
        apiKey: 'ok',
        model: undefined,
        maxTokens: 1024,
        temperature: 0.4,
        messages,
      });
    });

    it('normalizes empty-string model to undefined', async () => {
      const service = await makeService({ OPENAI_API_KEY: 'ok' });
      await service.chatMessages(messages, { model: '  ' });
      expect(mockProvider.chat.mock.calls[0][0].model).toBeUndefined();
    });

    it('forwards explicit model, temperature and maxTokens', async () => {
      const service = await makeService({ CLAUDE_API_KEY: 'ck' });
      await service.chatMessages(messages, {
        provider: 'claude',
        model: 'claude-sonnet-4-5',
        temperature: 0.9,
        maxTokens: 2048,
      });

      expect(mockProvider.chat).toHaveBeenCalledWith({
        provider: 'claude',
        apiKey: 'ck',
        model: 'claude-sonnet-4-5',
        maxTokens: 2048,
        temperature: 0.9,
        messages,
      });
    });

    it('prefers per-tenant apiKeys over environment keys', async () => {
      const service = await makeService({ DEEPSEEK_API_KEY: 'env-dk' });
      await service.chatMessages(messages, {
        apiKeys: { deepseek: 'tenant-dk' },
      });

      expect(mockProvider.chat).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'deepseek', apiKey: 'tenant-dk' }),
      );
    });

    it('resolves gemini when only a tenant gemini key exists', async () => {
      const service = await makeService();
      await service.chatMessages(messages, { apiKeys: { gemini: 'tg' } });

      expect(mockProvider.chat).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'gemini', apiKey: 'tg' }),
      );
    });

    it('throws when no key is available for any provider', async () => {
      const service = await makeService();
      await expect(service.chatMessages(messages)).rejects.toThrow(
        new BadRequestException(
          'No hay API key de IA configurada (DeepSeek, Claude, OpenAI o Gemini)',
        ),
      );
    });

    it('propagates provider errors', async () => {
      mockProvider.chat.mockRejectedValue(
        new BadRequestException('openai API error: boom'),
      );
      const service = await makeService({ OPENAI_API_KEY: 'ok' });
      await expect(service.chatMessages(messages)).rejects.toThrow(
        'openai API error: boom',
      );
    });
  });

  // ─── parseJson ─────────────────────────────────────────────────────────────

  describe('parseJson', () => {
    it('extracts a JSON object embedded in text', async () => {
      const service = await makeService();
      expect(
        service.parseJson<{ a: number }>('bla {"a": 1} bla'),
      ).toEqual({ a: 1 });
    });

    it('extracts a JSON array', async () => {
      const service = await makeService();
      expect(service.parseJson<number[]>('resultado: [1,2,3]')).toEqual([
        1, 2, 3,
      ]);
    });

    it('throws BadRequestException when there is no JSON', async () => {
      const service = await makeService();
      expect(() => service.parseJson('sin json')).toThrow(
        new BadRequestException('La IA devolvió una respuesta inválida'),
      );
    });
  });
});
