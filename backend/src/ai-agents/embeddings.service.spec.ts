import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingsService } from './embeddings.service';
import { EMBEDDINGS_PROVIDER } from '../ai/providers/ai-provider.interface';

// ─── helpers ─────────────────────────────────────────────────────────────────

const mockProvider = { embed: jest.fn() };

async function makeService(openaiKey?: string): Promise<EmbeddingsService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      EmbeddingsService,
      {
        provide: ConfigService,
        useValue: { get: jest.fn().mockReturnValue(openaiKey) },
      },
      { provide: EMBEDDINGS_PROVIDER, useValue: mockProvider },
    ],
  }).compile();
  return module.get<EmbeddingsService>(EmbeddingsService);
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('EmbeddingsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProvider.embed.mockResolvedValue([[0.1, 0.2]]);
  });

  describe('enabled', () => {
    it('is true when OPENAI_API_KEY is set', async () => {
      const service = await makeService('sk-test');
      expect(service.enabled).toBe(true);
    });

    it('is false when OPENAI_API_KEY is missing', async () => {
      const service = await makeService();
      expect(service.enabled).toBe(false);
    });
  });

  describe('embed', () => {
    it('throws without calling the provider when key is missing', async () => {
      const service = await makeService();
      await expect(service.embed('hola')).rejects.toThrow(
        new BadRequestException(
          'OPENAI_API_KEY no configurada (requerida para embeddings/RAG)',
        ),
      );
      expect(mockProvider.embed).not.toHaveBeenCalled();
    });

    it('wraps a single string into an array', async () => {
      const service = await makeService('sk-test');
      const result = await service.embed('hola');
      expect(mockProvider.embed).toHaveBeenCalledWith(['hola']);
      expect(result).toEqual([[0.1, 0.2]]);
    });

    it('normalizes newlines and truncates texts to 8000 chars', async () => {
      const service = await makeService('sk-test');
      const long = 'a'.repeat(9000);
      await service.embed(['linea1\nlinea2', long]);

      const texts = mockProvider.embed.mock.calls[0][0] as string[];
      expect(texts[0]).toBe('linea1 linea2');
      expect(texts[1]).toHaveLength(8000);
    });

    it('returns the provider result for a batch', async () => {
      mockProvider.embed.mockResolvedValue([
        [1, 2],
        [3, 4],
      ]);
      const service = await makeService('sk-test');
      expect(await service.embed(['a', 'b'])).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });

    it('propagates provider errors', async () => {
      mockProvider.embed.mockRejectedValue(
        new BadRequestException('OpenAI embeddings error: boom'),
      );
      const service = await makeService('sk-test');
      await expect(service.embed('x')).rejects.toThrow(
        'OpenAI embeddings error: boom',
      );
    });
  });

  describe('embedOne', () => {
    it('returns the first vector', async () => {
      const service = await makeService('sk-test');
      expect(await service.embedOne('hola')).toEqual([0.1, 0.2]);
    });
  });
});
