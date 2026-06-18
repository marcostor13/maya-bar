import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { KnowledgeChunk } from './knowledge-chunk.schema';
import { EmbeddingsService, EMBEDDING_DIMS } from './embeddings.service';

const VECTOR_INDEX = 'vector_index';
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;

export interface RetrievedChunk {
  text: string;
  score: number;
}

@Injectable()
export class RagService implements OnModuleInit {
  private readonly logger = new Logger(RagService.name);
  private vectorReady = false;

  constructor(
    @InjectModel(KnowledgeChunk.name) private chunkModel: Model<KnowledgeChunk>,
    private embeddings: EmbeddingsService,
  ) {}

  async onModuleInit() {
    // Crea el índice Atlas Vector Search si no existe (no-op fuera de Atlas).
    try {
      const coll = this.chunkModel.collection;
      const existing = await coll.listSearchIndexes().toArray().catch(() => []);
      if (existing.some((i: { name?: string }) => i.name === VECTOR_INDEX)) {
        this.vectorReady = true;
        return;
      }
      await coll.createSearchIndex({
        name: VECTOR_INDEX,
        type: 'vectorSearch',
        definition: {
          fields: [
            { type: 'vector', path: 'embedding', numDimensions: EMBEDDING_DIMS, similarity: 'cosine' },
            { type: 'filter', path: 'aId' },
            { type: 'filter', path: 'tId' },
          ],
        },
      });
      this.vectorReady = true;
      this.logger.log(`Índice vectorial "${VECTOR_INDEX}" creado en Atlas.`);
    } catch (err) {
      this.logger.warn(
        `No se pudo crear el índice vectorial Atlas (¿no es Atlas?). RAG usará fallback por similitud coseno. Detalle: ${String(err)}`,
      );
    }
  }

  // ---- Ingesta ----

  extractText(buffer: Buffer, contentType?: string): Promise<string> {
    if (contentType === 'application/pdf') return this.extractPdf(buffer);
    return Promise.resolve(buffer.toString('utf-8'));
  }

  private async extractPdf(buffer: Buffer): Promise<string> {
    // import dinámico para evitar el self-test de pdf-parse al cargar el módulo
    const mod = (await import('pdf-parse')) as unknown as {
      default: (b: Buffer) => Promise<{ text: string }>;
    };
    const data = await mod.default(buffer);
    return data.text;
  }

  chunk(text: string): string[] {
    const clean = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (!clean) return [];
    const chunks: string[] = [];
    let i = 0;
    while (i < clean.length) {
      let end = Math.min(i + CHUNK_SIZE, clean.length);
      // intenta cortar en un límite de párrafo/oración
      if (end < clean.length) {
        const slice = clean.slice(i, end);
        const lastBreak = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '));
        if (lastBreak > CHUNK_SIZE * 0.5) end = i + lastBreak + 1;
      }
      const piece = clean.slice(i, end).trim();
      if (piece) chunks.push(piece);
      i = end - CHUNK_OVERLAP;
      if (i <= 0) i = end;
    }
    return chunks;
  }

  /** Procesa un documento: trocea, embebe y persiste los chunks. Devuelve nº de chunks y caracteres. */
  async ingest(
    tenantId: string,
    agentId: string,
    docId: string,
    buffer: Buffer,
    contentType?: string,
  ): Promise<{ chunkCount: number; charCount: number }> {
    const text = await this.extractText(buffer, contentType);
    const pieces = this.chunk(text);
    if (pieces.length === 0) return { chunkCount: 0, charCount: 0 };

    const aId = String(agentId);
    const tId = String(tenantId);
    // embeber en lotes de 100
    const docs: Partial<KnowledgeChunk>[] = [];
    for (let b = 0; b < pieces.length; b += 100) {
      const batch = pieces.slice(b, b + 100);
      const vecs = await this.embeddings.embed(batch);
      batch.forEach((piece, k) => {
        docs.push({
          tenantId: new Types.ObjectId(tenantId),
          agentId: new Types.ObjectId(agentId),
          docId: new Types.ObjectId(docId),
          aId,
          tId,
          text: piece,
          embedding: vecs[k],
          index: b + k,
        });
      });
    }
    await this.chunkModel.insertMany(docs);
    return { chunkCount: docs.length, charCount: text.length };
  }

  async deleteByDoc(docId: string) {
    await this.chunkModel.deleteMany({ docId: new Types.ObjectId(docId) }).exec();
  }

  async deleteByAgent(agentId: string) {
    await this.chunkModel.deleteMany({ agentId: new Types.ObjectId(agentId) }).exec();
  }

  // ---- Recuperación ----

  async retrieve(tenantId: string, agentId: string, query: string, topK = 5): Promise<RetrievedChunk[]> {
    const total = await this.chunkModel.countDocuments({ agentId: new Types.ObjectId(agentId) }).exec();
    if (total === 0) return [];
    const queryVector = await this.embeddings.embedOne(query);

    if (this.vectorReady) {
      try {
        const results = await this.chunkModel
          .aggregate<{ text: string; score: number }>([
            {
              $vectorSearch: {
                index: VECTOR_INDEX,
                path: 'embedding',
                queryVector,
                numCandidates: Math.max(topK * 20, 100),
                limit: topK,
                filter: { aId: { $eq: String(agentId) }, tId: { $eq: String(tenantId) } },
              },
            },
            { $project: { _id: 0, text: 1, score: { $meta: 'vectorSearchScore' } } },
          ])
          .exec();
        if (results.length > 0) return results;
      } catch (err) {
        this.logger.warn(`$vectorSearch falló, usando fallback coseno: ${String(err)}`);
      }
    }

    // Fallback: similitud coseno en memoria
    const chunks = await this.chunkModel
      .find({ agentId: new Types.ObjectId(agentId) }, { text: 1, embedding: 1 })
      .lean()
      .exec();
    return chunks
      .map((c) => ({ text: c.text as string, score: cosine(queryVector, c.embedding as number[]) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
