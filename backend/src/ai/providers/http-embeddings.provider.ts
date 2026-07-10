import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingsProvider } from './ai-provider.interface';

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMS = 1536;

/**
 * Implementación HTTP (fetch) de EmbeddingsProvider contra OpenAI.
 * Mismo endpoint, headers, parseo y mensaje de error que el código original.
 */
@Injectable()
export class HttpEmbeddingsProvider implements EmbeddingsProvider {
  private openaiKey: string;

  constructor(config: ConfigService) {
    this.openaiKey = config.get<string>('OPENAI_API_KEY') ?? '';
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.openaiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new BadRequestException(`OpenAI embeddings error: ${err}`);
    }
    const data = (await res.json()) as { data: { embedding: number[] }[] };
    return data.data.map((d) => d.embedding);
  }
}
