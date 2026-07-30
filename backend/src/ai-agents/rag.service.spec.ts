import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { RagService } from './rag.service';
import { KnowledgeChunk } from './knowledge-chunk.schema';
import { EmbeddingsService } from './embeddings.service';

/** Construye un PDF mínimo y válido con el texto indicado. */
function makePdf(text: string): Buffer {
  const stream = `BT /F1 14 Tf 72 700 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => {
    pdf += String(o).padStart(10, '0') + ' 00000 n \n';
  });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

const mockChunkModel = {
  collection: { listSearchIndexes: jest.fn(), createSearchIndex: jest.fn() },
  insertMany: jest.fn(),
  deleteMany: jest.fn(),
  countDocuments: jest.fn(),
  find: jest.fn(),
  aggregate: jest.fn(),
};

const mockEmbeddings = { embed: jest.fn(), embedOne: jest.fn() };

describe('RagService', () => {
  let service: RagService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RagService,
        {
          provide: getModelToken(KnowledgeChunk.name),
          useValue: mockChunkModel,
        },
        { provide: EmbeddingsService, useValue: mockEmbeddings },
      ],
    }).compile();
    service = module.get<RagService>(RagService);
  });

  describe('extractText', () => {
    const SAMPLE = 'Horario del bar: 9 a 18. Cerramos los lunes.';

    // Regresión: pdf-parse v2 no expone default export; llamar a mod.default()
    // lanzaba "TypeError: mod.default is not a function" al subir un PDF al RAG.
    it('extracts text from a real PDF via content-type', async () => {
      const text = await service.extractText(
        makePdf(SAMPLE),
        'application/pdf',
      );
      expect(text).toContain(SAMPLE);
    });

    it('detects a PDF by magic bytes when the content-type is generic', async () => {
      const text = await service.extractText(
        makePdf(SAMPLE),
        'application/octet-stream',
      );
      expect(text).toContain(SAMPLE);
    });

    it('does not leak the "-- N of M --" page marker into the text', async () => {
      const text = await service.extractText(
        makePdf(SAMPLE),
        'application/pdf',
      );
      expect(text).not.toMatch(/--\s*\d+\s+of\s+\d+\s*--/);
    });

    it('reads non-PDF payloads as utf-8', async () => {
      const text = await service.extractText(
        Buffer.from('Línea uno.\nLínea dos.', 'utf-8'),
        'text/plain',
      );
      expect(text).toBe('Línea uno.\nLínea dos.');
    });
  });

  describe('chunk', () => {
    it('returns an empty array for blank input', () => {
      expect(service.chunk('   \n\n  ')).toEqual([]);
    });

    it('keeps short text as a single chunk', () => {
      expect(service.chunk('Texto corto.')).toEqual(['Texto corto.']);
    });

    it('splits long text into overlapping chunks and terminates', () => {
      const chunks = service.chunk('Frase de prueba. '.repeat(400));
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(1000));
    });
  });

  describe('ingest', () => {
    it('embeds and persists the chunks of a PDF', async () => {
      mockEmbeddings.embed.mockResolvedValue([[0.1, 0.2, 0.3]]);
      mockChunkModel.insertMany.mockResolvedValue([]);

      const res = await service.ingest(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
        '507f1f77bcf86cd799439013',
        makePdf('Contenido de la carta.'),
        'application/pdf',
      );

      expect(res.chunkCount).toBe(1);
      expect(res.charCount).toBeGreaterThan(0);
      expect(mockEmbeddings.embed).toHaveBeenCalledTimes(1);
      const inserted = mockChunkModel.insertMany.mock.calls[0][0] as {
        text: string;
        embedding: number[];
      }[];
      expect(inserted[0].text).toContain('Contenido de la carta.');
      expect(inserted[0].embedding).toEqual([0.1, 0.2, 0.3]);
    });

    it('skips embedding and insertion when the document has no text', async () => {
      const res = await service.ingest(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
        '507f1f77bcf86cd799439013',
        Buffer.from('   ', 'utf-8'),
        'text/plain',
      );
      expect(res).toEqual({ chunkCount: 0, charCount: 0 });
      expect(mockEmbeddings.embed).not.toHaveBeenCalled();
      expect(mockChunkModel.insertMany).not.toHaveBeenCalled();
    });
  });
});
