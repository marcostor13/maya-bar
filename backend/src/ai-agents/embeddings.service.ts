import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMS = 1536;

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private openaiKey: string;

  constructor(private config: ConfigService) {
    this.openaiKey = config.get<string>('OPENAI_API_KEY') ?? '';
  }

  get enabled(): boolean {
    return !!this.openaiKey;
  }

  /** Genera embeddings para uno o varios textos (batch). */
  async embed(input: string | string[]): Promise<number[][]> {
    if (!this.openaiKey)
      throw new BadRequestException('OPENAI_API_KEY no configurada (requerida para embeddings/RAG)');
    const texts = (Array.isArray(input) ? input : [input]).map((t) => t.replace(/\n/g, ' ').slice(0, 8000));
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

  async embedOne(text: string): Promise<number[]> {
    const [vec] = await this.embed(text);
    return vec;
  }
}
