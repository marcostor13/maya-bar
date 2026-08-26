import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, createConnection } from 'mongoose';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Customer } from '../customers/customer.schema';
import { ContactSource } from './contact-source.schema';
import {
  AnalyzeResult,
  ImportMongoDto,
  ImportOptionsDto,
  ImportResult,
  MongoConnectionDto,
  TARGET_FIELDS,
  TargetField,
} from './dto/contact-import.dto';
import { MAX_ROWS, ParsedTable, parseCsv, parseXlsx } from './table-parser';
import { isOwnerScoped } from '../auth/permissions';

/** Cuántos documentos se leen para deducir los campos de una colección. */
const SAMPLE_SIZE = 50;
const SAMPLE_VALUES = 3;
const CONNECT_TIMEOUT_MS = 8000;

/** Pistas por campo para sugerir el mapeo a partir del nombre de la columna. */
const FIELD_HINTS: Record<TargetField, string[]> = {
  name: ['name', 'nombre', 'cliente', 'contacto', 'fullname', 'nombres'],
  email: ['email', 'correo', 'e-mail', 'mail'],
  phone: ['phone', 'telefono', 'teléfono', 'celular', 'movil', 'móvil', 'whatsapp', 'numero', 'número', 'msisdn'],
  tags: ['tag', 'tags', 'etiqueta', 'etiquetas', 'segmento', 'categoria', 'categoría'],
  notes: ['note', 'notes', 'nota', 'notas', 'comentario', 'observacion', 'observación'],
};

@Injectable()
export class ContactImportService {
  private readonly logger = new Logger(ContactImportService.name);

  constructor(
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
    @InjectModel(ContactSource.name)
    private sourceModel: Model<ContactSource>,
    private config: ConfigService,
  ) {}

  // ------------------------------------------------------------------
  // Archivos (xlsx / csv)
  // ------------------------------------------------------------------

  async analyzeFile(file: Express.Multer.File): Promise<AnalyzeResult> {
    const table = await this.parseFile(file);
    return this.describe(table.columns, table.rows, table.rows.length);
  }

  async importFile(
    tenantId: string,
    userId: string,
    role: string,
    file: Express.Multer.File,
    options: ImportOptionsDto,
  ): Promise<ImportResult> {
    const table = await this.parseFile(file);
    return this.importRows(tenantId, userId, role, table.rows, options, {
      source: 'import',
    });
  }

  private async parseFile(file: Express.Multer.File): Promise<ParsedTable> {
    if (!file?.buffer?.length)
      throw new BadRequestException('El archivo está vacío');

    const name = (file.originalname ?? '').toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xlsm'))
      return parseXlsx(file.buffer);
    if (name.endsWith('.csv') || name.endsWith('.txt'))
      return parseCsv(file.buffer.toString('utf-8'));
    if (name.endsWith('.xls'))
      throw new BadRequestException(
        'El formato .xls antiguo no está soportado: vuelve a guardarlo como .xlsx o CSV',
      );
    throw new BadRequestException(
      'Formato no soportado. Sube un archivo .xlsx o .csv',
    );
  }

  // ------------------------------------------------------------------
  // MongoDB externa
  // ------------------------------------------------------------------

  async analyzeMongo(dto: MongoConnectionDto): Promise<AnalyzeResult> {
    return this.withConnection(dto, async (collection) => {
      const [docs, total] = await Promise.all([
        collection
          .find(dto.filter ?? {})
          .limit(SAMPLE_SIZE)
          .toArray(),
        collection.countDocuments(dto.filter ?? {}),
      ]);
      if (docs.length === 0)
        throw new BadRequestException(
          'La colección no tiene documentos que coincidan con el filtro',
        );

      const rows = docs.map((d) => this.flatten(d));
      const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      return this.describe(columns, rows, total);
    });
  }

  async importMongo(
    tenantId: string,
    userId: string,
    role: string,
    dto: ImportMongoDto,
  ): Promise<ImportResult> {
    const source = await this.persistSource(tenantId, userId, dto);

    try {
      const result = await this.withConnection(dto, async (collection) => {
        const docs = await collection
          .find(dto.filter ?? {})
          .limit(MAX_ROWS)
          .toArray();
        const rows = docs.map((d) => this.flatten(d));
        return this.importRows(tenantId, userId, role, rows, dto.options, {
          source: 'mongodb',
          sourceId: source?._id as Types.ObjectId | undefined,
        });
      });

      if (source) {
        source.lastRunAt = new Date();
        source.lastImported = result.imported;
        source.lastUpdated = result.updated;
        source.lastError = undefined;
        await source.save();
        result.sourceId = String(source._id);
      }
      return result;
    } catch (err) {
      if (source) {
        source.lastRunAt = new Date();
        source.lastError = err instanceof Error ? err.message : String(err);
        await source.save();
      }
      throw err;
    }
  }

  /** Vuelve a ejecutar una conexión guardada con su mapeo. */
  async runSource(
    tenantId: string,
    userId: string,
    role: string,
    sourceId: string,
  ): Promise<ImportResult> {
    const source = await this.getSource(tenantId, sourceId);
    return this.importMongo(tenantId, userId, role, {
      uri: source.uri,
      database: source.database,
      collection: source.collectionName,
      filter: source.filter,
      options: {
        mapping: source.mapping as ImportOptionsDto['mapping'],
        tags: source.tags,
        dedupeBy: 'both',
        updateExisting: true,
        keepUnmapped: true,
      },
      sourceId: String(source._id),
    });
  }

  async listSources(tenantId: string) {
    const sources = await this.sourceModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .exec();
    return sources.map((s) => this.toPublic(s));
  }

  async deleteSource(tenantId: string, sourceId: string): Promise<void> {
    const source = await this.getSource(tenantId, sourceId);
    await this.sourceModel.findByIdAndDelete(source._id).exec();
  }

  private async getSource(
    tenantId: string,
    sourceId: string,
  ): Promise<ContactSource> {
    if (!Types.ObjectId.isValid(sourceId))
      throw new NotFoundException('Conexión no encontrada');
    const source = await this.sourceModel
      .findOne({
        _id: new Types.ObjectId(sourceId),
        tenantId: new Types.ObjectId(tenantId),
      })
      .exec();
    if (!source) throw new NotFoundException('Conexión no encontrada');
    return source;
  }

  private async persistSource(
    tenantId: string,
    userId: string,
    dto: ImportMongoDto,
  ): Promise<ContactSource | null> {
    if (dto.sourceId) {
      const existing = await this.getSource(tenantId, dto.sourceId);
      existing.mapping = { ...dto.options.mapping };
      existing.tags = dto.options.tags ?? [];
      existing.filter = dto.filter;
      return existing.save();
    }
    if (!dto.saveAs?.trim()) return null;
    return this.sourceModel.create({
      tenantId: new Types.ObjectId(tenantId),
      label: dto.saveAs.trim(),
      uri: dto.uri,
      database: dto.database,
      collectionName: dto.collection,
      mapping: { ...dto.options.mapping },
      tags: dto.options.tags ?? [],
      filter: dto.filter,
      createdBy: new Types.ObjectId(userId),
    });
  }

  /** Nunca expone la URI: lleva credenciales. */
  private toPublic(s: ContactSource) {
    return {
      _id: String(s._id),
      label: s.label,
      host: this.hostsOf(s.uri).join(', '),
      database: s.database,
      collection: s.collectionName,
      mapping: s.mapping,
      tags: s.tags,
      lastRunAt: s.lastRunAt,
      lastImported: s.lastImported,
      lastUpdated: s.lastUpdated,
      lastError: s.lastError,
    };
  }

  /**
   * Abre la conexión externa, ejecuta el trabajo y la cierra siempre.
   * La URI se valida antes: un admin no puede apuntar a la red interna.
   */
  private async withConnection<T>(
    dto: MongoConnectionDto,
    work: (
      collection: ReturnType<
        NonNullable<ReturnType<typeof createConnection>['db']>['collection']
      >,
    ) => Promise<T>,
  ): Promise<T> {
    await this.assertUriAllowed(dto.uri, dto.database);

    const connection = createConnection(dto.uri, {
      dbName: dto.database,
      serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
      connectTimeoutMS: CONNECT_TIMEOUT_MS,
    });
    try {
      await connection.asPromise();
      const db = connection.db;
      if (!db) throw new BadRequestException('No se pudo abrir la base de datos');
      return await work(db.collection(dto.collection));
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(
        `No se pudo conectar a MongoDB: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      await connection.close().catch(() => undefined);
    }
  }

  /**
   * Un TENANT_ADMIN podría poner la URI de la base de la propia plataforma y
   * leer datos de otros tenants, o sondear la red interna. Se bloquean los
   * destinos privados salvo que el operador lo permita explícitamente.
   */
  private async assertUriAllowed(uri: string, database: string): Promise<void> {
    if (!/^mongodb(\+srv)?:\/\//i.test(uri))
      throw new BadRequestException(
        'La URI debe empezar por mongodb:// o mongodb+srv://',
      );

    const ownUri = this.config.get<string>('MONGODB_URI') ?? '';
    const ownHosts = this.hostsOf(ownUri);
    const hosts = this.hostsOf(uri);
    if (hosts.length === 0)
      throw new BadRequestException('La URI de MongoDB no es válida');

    if (
      hosts.some((h) => ownHosts.includes(h)) &&
      this.databaseOf(ownUri, database) === database
    ) {
      throw new BadRequestException(
        'No se puede importar desde la base de datos de la propia plataforma',
      );
    }

    if (this.config.get<string>('CONTACT_IMPORT_ALLOW_PRIVATE_HOSTS') === 'true')
      return;

    for (const host of hosts) {
      const address = isIP(host) ? host : await this.resolve(host);
      if (!address) continue;
      if (this.isPrivateAddress(address))
        throw new BadRequestException(
          `El host "${host}" apunta a una dirección interna y no está permitido`,
        );
    }
  }

  private async resolve(host: string): Promise<string | null> {
    try {
      const { address } = await lookup(host);
      return address;
    } catch {
      throw new BadRequestException(`No se pudo resolver el host "${host}"`);
    }
  }

  private isPrivateAddress(address: string): boolean {
    if (address === '::1' || address.startsWith('fc') || address.startsWith('fd'))
      return true;
    const parts = address.split('.').map(Number);
    if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
    const [a, b] = parts;
    return (
      a === 127 ||
      a === 0 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }

  /** Extrae los hosts de una URI de Mongo sin depender de URL(), que no la parsea. */
  private hostsOf(uri: string): string[] {
    const match = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/i.exec(uri);
    if (!match) return [];
    return match[1]
      .split(',')
      .map((h) => h.split(':')[0].trim().toLowerCase())
      .filter(Boolean);
  }

  private databaseOf(uri: string, fallback: string): string {
    const match = /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/i.exec(uri);
    return match?.[1] ?? fallback;
  }

  // ------------------------------------------------------------------
  // Análisis y mapeo
  // ------------------------------------------------------------------

  /** Columnas + valores de ejemplo + mapeo sugerido. */
  private describe(
    columns: string[],
    rows: Record<string, unknown>[],
    totalRows: number,
  ): AnalyzeResult {
    const samples: Record<string, string[]> = {};
    for (const col of columns) {
      const values: string[] = [];
      for (const row of rows) {
        const value = this.toText(row[col]);
        if (value && !values.includes(value)) values.push(value);
        if (values.length >= SAMPLE_VALUES) break;
      }
      samples[col] = values;
    }
    return { columns, samples, totalRows, suggested: this.suggest(columns) };
  }

  /** Empareja cada campo del contacto con la columna cuyo nombre más se parece. */
  private suggest(columns: string[]): Record<string, string> {
    const suggested: Record<string, string> = {};
    const taken = new Set<string>();

    for (const field of TARGET_FIELDS) {
      const hints = FIELD_HINTS[field];
      const match = columns.find((col) => {
        if (taken.has(col)) return false;
        const normalized = col.toLowerCase().replace(/[\s_-]/g, '');
        return hints.some((hint) =>
          normalized.includes(hint.replace(/[\s_-]/g, '')),
        );
      });
      if (match) {
        suggested[field] = match;
        taken.add(match);
      }
    }
    return suggested;
  }

  /** Aplana un documento a `campo.subcampo` para poder mapear anidados. */
  private flatten(
    doc: Record<string, unknown>,
    prefix = '',
    depth = 0,
  ): Record<string, unknown> {
    const flat: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(doc)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const isPlainObject =
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !(value instanceof Date) &&
        !(value instanceof Types.ObjectId) &&
        !Buffer.isBuffer(value);

      if (isPlainObject && depth < 2) {
        Object.assign(
          flat,
          this.flatten(value as Record<string, unknown>, path, depth + 1),
        );
      } else {
        flat[path] = value;
      }
    }
    return flat;
  }

  // ------------------------------------------------------------------
  // Importación
  // ------------------------------------------------------------------

  /** Normaliza las filas según el mapeo y las escribe en la base de contactos. */
  private async importRows(
    tenantId: string,
    userId: string,
    role: string,
    rows: Record<string, unknown>[],
    options: ImportOptionsDto,
    origin: { source: string; sourceId?: Types.ObjectId },
  ): Promise<ImportResult> {
    const mapping = options.mapping ?? {};
    if (!mapping.email && !mapping.phone)
      throw new BadRequestException(
        'Mapea al menos el email o el teléfono: son los campos que identifican al contacto',
      );

    const tid = new Types.ObjectId(tenantId);
    const ownerScoped = isOwnerScoped(role);
    const owner = ownerScoped ? new Types.ObjectId(userId) : undefined;
    const dedupeBy = options.dedupeBy ?? 'both';
    const extraTags = (options.tags ?? []).map((t) => t.trim()).filter(Boolean);
    const mapped = new Set(Object.values(mapping).filter(Boolean));

    const result: ImportResult = {
      total: rows.length,
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    type Op = Parameters<Model<Customer>['bulkWrite']>[0][number];
    const ops: Op[] = [];
    const seen = new Set<string>();

    rows.forEach((row, index) => {
      const email = this.normalizeEmail(this.pick(row, mapping.email));
      const phone = this.normalizePhone(this.pick(row, mapping.phone));

      if (!email && !phone) {
        result.skipped++;
        if (result.errors.length < 10)
          result.errors.push(`Fila ${index + 2}: sin email ni teléfono`);
        return;
      }

      // Duplicados dentro del mismo archivo: gana la primera aparición.
      const key = `${email ?? ''}|${phone ?? ''}`;
      if (seen.has(key)) {
        result.skipped++;
        return;
      }
      seen.add(key);

      const name =
        this.toText(this.pick(row, mapping.name)) ||
        email?.split('@')[0] ||
        phone ||
        'Sin nombre';
      const tags = [
        ...new Set([...this.splitTags(this.pick(row, mapping.tags)), ...extraTags]),
      ];
      const notes = this.toText(this.pick(row, mapping.notes));

      const set: Record<string, unknown> = { name };
      if (email) set.email = email;
      if (phone) set.phone = phone;
      if (notes) set.notes = notes;

      if (options.keepUnmapped) {
        const custom: Record<string, unknown> = {};
        for (const [column, value] of Object.entries(row)) {
          if (mapped.has(column)) continue;
          const text = this.toText(value);
          if (text) custom[column] = text;
        }
        if (Object.keys(custom).length) set.customFields = custom;
      }

      const filter: Record<string, unknown> = {
        tenantId: tid,
        ...(ownerScoped ? { createdBy: owner } : { createdBy: { $exists: false } }),
      };
      // Con "both" identifica por email si lo hay y, si no, por teléfono.
      if (dedupeBy === 'email' || (dedupeBy === 'both' && email)) {
        if (!email) {
          result.skipped++;
          return;
        }
        filter.email = email;
      } else {
        if (!phone) {
          result.skipped++;
          return;
        }
        filter.phone = phone;
      }

      ops.push({
        updateOne: {
          filter,
          update: {
            $setOnInsert: {
              tenantId: tid,
              source: origin.source,
              ...(origin.sourceId ? { sourceId: origin.sourceId } : {}),
              ...(owner ? { createdBy: owner } : {}),
            },
            $set: set,
            ...(tags.length ? { $addToSet: { tags: { $each: tags } } } : {}),
          },
          upsert: true,
        },
      } as Op);
    });

    if (ops.length === 0) return result;

    // Si no se deben tocar los existentes, el $set va dentro de $setOnInsert.
    const finalOps =
      options.updateExisting === false
        ? ops.map((op) => this.toInsertOnly(op))
        : ops;

    try {
      const write = await this.customerModel.bulkWrite(finalOps, {
        ordered: false,
      });
      result.imported = write.upsertedCount;
      result.updated = write.modifiedCount;
    } catch (err) {
      // bulkWrite no ordenado sigue tras cada fallo: se aprovecha lo escrito.
      const bulkErr = err as {
        result?: { nUpserted?: number; nModified?: number };
        writeErrors?: { errmsg?: string }[];
      };
      result.imported = bulkErr.result?.nUpserted ?? 0;
      result.updated = bulkErr.result?.nModified ?? 0;
      const failures = bulkErr.writeErrors ?? [];
      result.skipped += failures.length;
      for (const failure of failures.slice(0, 10))
        result.errors.push(failure.errmsg ?? 'Error al escribir el contacto');
      if (!failures.length) {
        this.logger.error(`Error importando contactos: ${String(err)}`);
        throw new BadRequestException(
          'No se pudieron importar los contactos. Revisa el mapeo de campos.',
        );
      }
    }

    return result;
  }

  /**
   * Mueve el `$set` a `$setOnInsert` para que la importación cree contactos
   * nuevos pero no pise los que ya existen.
   */
  private toInsertOnly<T>(op: T): T {
    const typed = op as unknown as {
      updateOne: { update: Record<string, unknown> };
    };
    const { $set, $setOnInsert, ...rest } = typed.updateOne.update as {
      $set?: Record<string, unknown>;
      $setOnInsert?: Record<string, unknown>;
    } & Record<string, unknown>;
    return {
      ...typed,
      updateOne: {
        ...typed.updateOne,
        update: {
          ...rest,
          $setOnInsert: { ...($setOnInsert ?? {}), ...($set ?? {}) },
        },
      },
    } as unknown as T;
  }

  private pick(row: Record<string, unknown>, column?: string): unknown {
    if (!column) return undefined;
    return row[column];
  }

  private toText(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map((v) => this.toText(v)).join(', ');
    if (typeof value === 'object') return String(value);
    return String(value).trim();
  }

  private normalizeEmail(value: unknown): string | undefined {
    const text = this.toText(value).toLowerCase();
    // Validación deliberadamente laxa: filtra basura sin rechazar direcciones raras pero válidas.
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : undefined;
  }

  /** Deja solo dígitos, conservando el prefijo internacional. */
  private normalizePhone(value: unknown): string | undefined {
    const raw = this.toText(value);
    if (!raw) return undefined;
    const plus = raw.trim().startsWith('+');
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return undefined;
    return plus ? `+${digits}` : digits;
  }

  private splitTags(value: unknown): string[] {
    const text = this.toText(value);
    if (!text) return [];
    return text
      .split(/[;,|]/)
      .map((t) => t.trim())
      .filter(Boolean);
  }
}
