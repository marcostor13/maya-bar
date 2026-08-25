import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HttpEmbeddingsProvider,
  EMBEDDING_MODEL,
} from './http-embeddings.provider';

function mockResponse(body: unknown, ok = true, errText = 'boom') {
  return {
    ok,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(errText),
  } as unknown as Response;
}

describe('HttpEmbeddingsProvider', () => {
  let provider: HttpEmbeddingsProvider;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    const config = {
      get: jest.fn().mockReturnValue('sk-test'),
    } as unknown as ConfigService;
    provider = new HttpEmbeddingsProvider(config);
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('calls the OpenAI embeddings endpoint and returns the vectors', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse({
        data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }],
      }),
    );

    const result = await provider.embed(['uno', 'dos']);

    expect(result).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('https://api.openai.com/v1/embeddings');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer sk-test',
    );
    expect(JSON.parse(String(init.body))).toEqual({
      model: EMBEDDING_MODEL,
      input: ['uno', 'dos'],
    });
  });

  it('throws BadRequestException with the provider error text', async () => {
    fetchSpy.mockResolvedValue(mockResponse({}, false, 'invalid key'));
    await expect(provider.embed(['x'])).rejects.toThrow(
      new BadRequestException('OpenAI embeddings error: invalid key'),
    );
  });
});
