import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { SuppressionService } from './suppression.service';
import { SuppressionEntry } from './suppression-entry.schema';

const tenantId = new Types.ObjectId().toString();

describe('SuppressionService', () => {
  let service: SuppressionService;
  let model: any;

  const build = async (rows: { phone?: string; email?: string }[] = []) => {
    const saved: any[] = [];
    // Doble del modelo de Mongoose: constructor + métodos estáticos.
    model = function (this: any, doc: any) {
      Object.assign(this, doc);
      this.save = jest.fn().mockImplementation(() => {
        saved.push(this);
        return Promise.resolve(this);
      });
    } as any;
    model.find = jest.fn().mockReturnValue({
      lean: () => ({ exec: () => Promise.resolve(rows) }),
      sort: () => ({ limit: () => ({ exec: () => Promise.resolve(rows) }) }),
    });
    model.findOne = jest.fn().mockResolvedValue(null);
    model.exists = jest.fn().mockResolvedValue(null);
    model.deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });
    model.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 1 });
    model.countDocuments = jest.fn().mockResolvedValue(rows.length);
    model.__saved = saved;

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SuppressionService,
        { provide: getModelToken(SuppressionEntry.name), useValue: model },
      ],
    }).compile();
    service = mod.get(SuppressionService);
  };

  beforeEach(() => jest.clearAllMocks());

  it('excluye de una campaña a quien está de baja, escrito como esté el número', async () => {
    // En la lista está guardado en dígitos; los contactos lo traen con formato.
    await build([{ phone: '51999888777' }]);

    const { allowed, blocked } = await service.filterAllowed(tenantId, [
      { phone: '+51 999 888 777', email: 'ana@mail.com' },
      { phone: '999888777', email: 'otro@mail.com' }, // nacional, mismo número
      { phone: '+51 911 222 333', email: 'ok@mail.com' },
    ]);

    expect(blocked).toBe(2);
    expect(allowed).toHaveLength(1);
    expect(allowed[0].email).toBe('ok@mail.com');
  });

  it('excluye también por email, sin importar mayúsculas', async () => {
    await build([{ email: 'harta@mail.com' }]);

    const { allowed, blocked } = await service.filterAllowed(tenantId, [
      { email: 'Harta@Mail.com' },
      { email: 'otra@mail.com' },
    ]);

    expect(blocked).toBe(1);
    expect(allowed[0].email).toBe('otra@mail.com');
  });

  it('no toca la audiencia cuando la lista está vacía', async () => {
    await build([]);
    const people = [{ phone: '+51 999 888 777' }, { email: 'a@b.com' }];

    const { allowed, blocked } = await service.filterAllowed(tenantId, people);

    expect(blocked).toBe(0);
    expect(allowed).toBe(people); // misma referencia: no se filtra en vano
  });

  it('deja pasar a un contacto sin teléfono ni email en vez de bloquearlo', async () => {
    await build([{ phone: '51999888777' }]);
    const { allowed, blocked } = await service.filterAllowed(tenantId, [
      { phone: undefined, email: undefined },
    ]);
    expect(blocked).toBe(0);
    expect(allowed).toHaveLength(1);
  });

  it('exige al menos un dato de contacto para dar de baja', async () => {
    await build();
    await expect(service.add(tenantId, {})).rejects.toThrow(
      /teléfono o un email/i,
    );
  });

  it('guarda el teléfono normalizado, no como lo escribieron', async () => {
    await build();
    await service.add(tenantId, { phone: '+51 999 888 777', name: 'Ana' });
    expect(model.__saved[0].phone).toBe('51999888777');
  });

  it('repetir la baja actualiza la entrada existente en vez de duplicarla', async () => {
    await build();
    const existing: any = {
      phone: '51999888777',
      save: jest.fn().mockImplementation(function (this: any) {
        return Promise.resolve(this);
      }),
    };
    model.findOne.mockResolvedValue(existing);

    await service.add(tenantId, { phone: '999888777', reason: 'Pidió baja' });

    expect(existing.reason).toBe('Pidió baja');
    expect(existing.save).toHaveBeenCalled();
    expect(model.__saved).toHaveLength(0); // no se creó ninguna entrada nueva
  });
});
