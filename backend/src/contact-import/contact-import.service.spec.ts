import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import ExcelJS from 'exceljs';
import { ContactImportService } from './contact-import.service';
import { ContactSource } from './contact-source.schema';
import { Customer } from '../customers/customer.schema';
import { ImportOptionsDto } from './dto/contact-import.dto';

const tenantId = new Types.ObjectId().toString();
const userId = new Types.ObjectId().toString();

/** Fila de bulkWrite tal como la construye el service. */
interface BulkOp {
  updateOne: {
    filter: Record<string, unknown>;
    update: {
      $set?: Record<string, unknown>;
      $setOnInsert?: Record<string, unknown>;
      $addToSet?: { tags?: { $each: string[] } };
    };
    upsert: boolean;
  };
}

function csvFile(content: string, name = 'contactos.csv') {
  return {
    originalname: name,
    buffer: Buffer.from(content, 'utf-8'),
  } as Express.Multer.File;
}

describe('ContactImportService', () => {
  let service: ContactImportService;
  let customerModel: { bulkWrite: jest.Mock };
  let sourceModel: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock };
  let config: { get: jest.Mock };

  const options = (over: Partial<ImportOptionsDto> = {}): ImportOptionsDto => ({
    mapping: { name: 'nombre', email: 'email', phone: 'telefono' },
    dedupeBy: 'both',
    ...over,
  });

  const opsOf = (): BulkOp[] =>
    customerModel.bulkWrite.mock.calls[0][0] as BulkOp[];

  beforeEach(async () => {
    customerModel = {
      bulkWrite: jest
        .fn()
        .mockResolvedValue({ upsertedCount: 0, modifiedCount: 0 }),
    };
    sourceModel = { find: jest.fn(), findOne: jest.fn(), create: jest.fn() };
    config = { get: jest.fn().mockReturnValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ContactImportService,
        { provide: getModelToken(Customer.name), useValue: customerModel },
        { provide: getModelToken(ContactSource.name), useValue: sourceModel },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get(ContactImportService);
  });

  // ── Análisis ──

  describe('analyzeFile', () => {
    it('devuelve columnas, ejemplos y total', async () => {
      const result = await service.analyzeFile(
        csvFile('nombre,email\nMarcos,m@bar.com\nAna,a@bar.com'),
      );
      expect(result.columns).toEqual(['nombre', 'email']);
      expect(result.samples['nombre']).toEqual(['Marcos', 'Ana']);
      expect(result.totalRows).toBe(2);
    });

    it('sugiere el mapeo por el nombre de la columna, en español e inglés', async () => {
      const result = await service.analyzeFile(
        csvFile('Nombre completo,Correo,Celular,Etiquetas,Observaciones\na,b,c,d,e'),
      );
      expect(result.suggested).toEqual({
        name: 'Nombre completo',
        email: 'Correo',
        phone: 'Celular',
        tags: 'Etiquetas',
        notes: 'Observaciones',
      });
    });

    it('no asigna la misma columna a dos campos', async () => {
      const result = await service.analyzeFile(csvFile('nombre\nMarcos'));
      expect(result.suggested).toEqual({ name: 'nombre' });
    });

    it('rechaza formatos que no sabe leer', async () => {
      await expect(
        service.analyzeFile(csvFile('x', 'contactos.pdf')),
      ).rejects.toThrow(/Formato no soportado/);
    });

    it('avisa de que .xls antiguo no sirve', async () => {
      await expect(
        service.analyzeFile(csvFile('x', 'viejo.xls')),
      ).rejects.toThrow(/\.xls antiguo/);
    });

    it('lee también xlsx', async () => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('c');
      sheet.addRow(['nombre', 'telefono']);
      sheet.addRow(['Marcos', '51999888777']);
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      const result = await service.analyzeFile({
        originalname: 'c.xlsx',
        buffer,
      } as Express.Multer.File);
      expect(result.columns).toEqual(['nombre', 'telefono']);
    });
  });

  // ── Importación ──

  describe('importFile', () => {
    it('exige mapear email o teléfono', async () => {
      await expect(
        service.importFile(
          tenantId,
          userId,
          'TENANT_ADMIN',
          csvFile('nombre\nMarcos'),
          options({ mapping: { name: 'nombre' } }),
        ),
      ).rejects.toThrow(/email o el teléfono/);
    });

    it('normaliza email y teléfono', async () => {
      await service.importFile(
        tenantId,
        userId,
        'TENANT_ADMIN',
        csvFile('nombre,email,telefono\nMarcos,  MARCOS@Bar.com ,+51 (999) 888-777'),
        options(),
      );
      const set = opsOf()[0].updateOne.update.$set!;
      expect(set.email).toBe('marcos@bar.com');
      expect(set.phone).toBe('+51999888777');
    });

    it('descarta teléfonos y emails inválidos', async () => {
      const result = await service.importFile(
        tenantId,
        userId,
        'TENANT_ADMIN',
        csvFile('nombre,email,telefono\nMarcos,no-es-email,123\nAna,ana@bar.com,51999888777'),
        options(),
      );
      expect(result.skipped).toBe(1);
      expect(result.errors[0]).toContain('Fila 2');
      expect(opsOf()).toHaveLength(1);
    });

    it('usa el email como nombre cuando falta', async () => {
      await service.importFile(
        tenantId,
        userId,
        'TENANT_ADMIN',
        csvFile('email\nmarcos@bar.com'),
        options({ mapping: { email: 'email' } }),
      );
      expect(opsOf()[0].updateOne.update.$set!.name).toBe('marcos');
    });

    it('deduplica dentro del propio archivo', async () => {
      const result = await service.importFile(
        tenantId,
        userId,
        'TENANT_ADMIN',
        csvFile('email\nm@bar.com\nm@bar.com\na@bar.com'),
        options({ mapping: { email: 'email' } }),
      );
      expect(opsOf()).toHaveLength(2);
      expect(result.skipped).toBe(1);
    });

    it('identifica por email si lo hay y si no por teléfono', async () => {
      await service.importFile(
        tenantId,
        userId,
        'TENANT_ADMIN',
        csvFile('email,telefono\nm@bar.com,51999888777\n,51988777666'),
        options({ mapping: { email: 'email', phone: 'telefono' } }),
      );
      const [first, second] = opsOf();
      expect(first.updateOne.filter.email).toBe('m@bar.com');
      expect(first.updateOne.filter.phone).toBeUndefined();
      expect(second.updateOne.filter.phone).toBe('51988777666');
    });

    it('parte las etiquetas y añade las de la importación', async () => {
      await service.importFile(
        tenantId,
        userId,
        'TENANT_ADMIN',
        csvFile('email,etiquetas\nm@bar.com,vip; frecuente'),
        options({
          mapping: { email: 'email', tags: 'etiquetas' },
          tags: ['importado'],
        }),
      );
      expect(opsOf()[0].updateOne.update.$addToSet!.tags!.$each).toEqual([
        'vip',
        'frecuente',
        'importado',
      ]);
    });

    it('guarda las columnas sin mapear en customFields', async () => {
      await service.importFile(
        tenantId,
        userId,
        'TENANT_ADMIN',
        csvFile('email,dni,ciudad\nm@bar.com,4444,Lima'),
        options({ mapping: { email: 'email' }, keepUnmapped: true }),
      );
      expect(opsOf()[0].updateOne.update.$set!.customFields).toEqual({
        dni: '4444',
        ciudad: 'Lima',
      });
    });

    it('sin keepUnmapped no guarda nada extra', async () => {
      await service.importFile(
        tenantId,
        userId,
        'TENANT_ADMIN',
        csvFile('email,dni\nm@bar.com,4444'),
        options({ mapping: { email: 'email' } }),
      );
      expect(opsOf()[0].updateOne.update.$set!.customFields).toBeUndefined();
    });

    it('con updateExisting=false no pisa los contactos que ya existen', async () => {
      await service.importFile(
        tenantId,
        userId,
        'TENANT_ADMIN',
        csvFile('nombre,email\nMarcos,m@bar.com'),
        options({ updateExisting: false }),
      );
      const update = opsOf()[0].updateOne.update;
      expect(update.$set).toBeUndefined();
      expect(update.$setOnInsert!.name).toBe('Marcos');
      expect(update.$setOnInsert!.email).toBe('m@bar.com');
    });

    it('marca el origen de los contactos importados', async () => {
      await service.importFile(
        tenantId,
        userId,
        'TENANT_ADMIN',
        csvFile('email\nm@bar.com'),
        options({ mapping: { email: 'email' } }),
      );
      expect(opsOf()[0].updateOne.update.$setOnInsert!.source).toBe('import');
    });

    it('el impulsador solo importa a su propia lista', async () => {
      await service.importFile(
        tenantId,
        userId,
        'IMPULSADOR',
        csvFile('email\nm@bar.com'),
        options({ mapping: { email: 'email' } }),
      );
      const op = opsOf()[0].updateOne;
      expect(String(op.filter.createdBy)).toBe(userId);
      expect(String(op.update.$setOnInsert!.createdBy)).toBe(userId);
    });

    it('reporta lo escrito aunque algunas filas fallen', async () => {
      customerModel.bulkWrite.mockRejectedValue({
        result: { nUpserted: 1, nModified: 0 },
        writeErrors: [{ errmsg: 'duplicate key' }],
      });
      const result = await service.importFile(
        tenantId,
        userId,
        'TENANT_ADMIN',
        csvFile('email\nm@bar.com\na@bar.com'),
        options({ mapping: { email: 'email' } }),
      );
      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.errors).toContain('duplicate key');
    });
  });

  // ── Seguridad de la conexión externa ──

  describe('analyzeMongo', () => {
    it('rechaza una URI que no es de MongoDB', async () => {
      await expect(
        service.analyzeMongo({
          uri: 'http://evil.com',
          database: 'db',
          collection: 'c',
        }),
      ).rejects.toThrow(/mongodb:\/\//);
    });

    it('bloquea hosts internos', async () => {
      await expect(
        service.analyzeMongo({
          uri: 'mongodb://127.0.0.1:27017',
          database: 'db',
          collection: 'c',
        }),
      ).rejects.toThrow(/dirección interna/);

      await expect(
        service.analyzeMongo({
          uri: 'mongodb://10.0.0.5:27017',
          database: 'db',
          collection: 'c',
        }),
      ).rejects.toThrow(/dirección interna/);
    });

    it('bloquea la base de datos de la propia plataforma', async () => {
      config.get.mockImplementation((key: string) =>
        key === 'MONGODB_URI' ? 'mongodb://cluster.mongodb.net/maya' : undefined,
      );
      await expect(
        service.analyzeMongo({
          uri: 'mongodb://cluster.mongodb.net',
          database: 'maya',
          collection: 'customers',
        }),
      ).rejects.toThrow(/propia plataforma/);
    });

    it('permite hosts internos si el operador lo habilita', async () => {
      config.get.mockImplementation((key: string) =>
        key === 'CONTACT_IMPORT_ALLOW_PRIVATE_HOSTS' ? 'true' : undefined,
      );
      // Ya no falla por la validación de host: falla al conectar, que es otra cosa.
      await expect(
        service.analyzeMongo({
          uri: 'mongodb://127.0.0.1:1/db',
          database: 'db',
          collection: 'c',
        }),
      ).rejects.toThrow(/No se pudo conectar/);
    }, 20000);

    it('los errores de conexión salen como BadRequest', async () => {
      config.get.mockImplementation((key: string) =>
        key === 'CONTACT_IMPORT_ALLOW_PRIVATE_HOSTS' ? 'true' : undefined,
      );
      await expect(
        service.analyzeMongo({
          uri: 'mongodb://127.0.0.1:1/db',
          database: 'db',
          collection: 'c',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }, 20000);
  });
});
