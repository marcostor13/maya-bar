import {
  Injectable,
  Inject,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMBEDDINGS_PROVIDER } from '../ai/providers/ai-provider.interface';
import type { EmbeddingsProvider } from '../ai/providers/ai-provider.interface';

export {
  EMBEDDING_MODEL,
  EMBEDDING_DIMS,
} from '../ai/providers/http-embeddings.provider';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private openaiKey: string;

  constructor(
    private config: ConfigService,
    @Inject(EMBEDDINGS_PROVIDER) private provider: EmbeddingsProvider,
  ) {
    this.openaiKey = config.get<string>('OPENAI_API_KEY') ?? '';
  }

  get enabled(): boolean {
    return !!this.openaiKey;
  }

  /** Genera embeddings para uno o varios textos (batch). */
  async embed(input: string | string[]): Promise<number[][]> {
    if (!this.openaiKey)
      throw new BadRequestException(
        'OPENAI_API_KEY no configurada (requerida para embeddings/RAG)',
      );
    const texts = (Array.isArray(input) ? input : [input]).map((t) =>
      t.replace(/\n/g, ' ').slice(0, 8000),
    );
    return this.provider.embed(texts);
  }

  async embedOne(text: string): Promise<number[]> {
    const [vec] = await this.embed(text);
    return vec;
  }
}
