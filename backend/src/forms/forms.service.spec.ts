import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { FormsService } from './forms.service';
import { ContactForm } from './form.schema';
import { FormSubmission } from './form-submission.schema';
import { Customer } from '../customers/customer.schema';
import { ContactList } from '../lists/contact-list.schema';

const tenantId = new Types.ObjectId();
const formId = new Types.ObjectId();

/** Documento de contacto falso con el `save()` que usa el service. */
function customerDoc(over: Partial<Record<string, unknown>> = {}) {
  const doc: Record<string, unknown> = {
    _id: new Types.ObjectId(),
    tenantId,
    name: 'Visitante Previo',
    email: undefined,
    phone: undefined,
    tags: [],
    customFields: {},
    save: jest.fn(),
    ...over,
  };
  (doc.save as jest.Mock).mockImplementation(() => Promise.resolve(doc));
  return doc;
}

/** Error tal como lo lanza Mongo al chocar con un índice único. */
function duplicateKeyError() {
  return Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
}

describe('FormsService.submit', () => {
  let service: FormsService;
  let formModel: { findOne: jest.Mock; updateOne: jest.Mock };
  let customerModel: jest.Mock & { findOne: jest.Mock };
  let submissionModel: { create: jest.Mock };
  let listModel: { updateMany: jest.Mock; find: jest.Mock };

  const form = {
    _id: formId,
    tenantId,
    name: 'Landing Verano',
    publicKey: 'k',
    active: true,
    createdBy: undefined,
    tags: ['landing'],
    listIds: [] as Types.ObjectId[],
    successMessage: 'Gracias',
    fields: [
      { key: 'nombre', label: 'Nombre', type: 'text', required: false, options: [], mapTo: 'name' },
      { key: 'email', label: 'Email', type: 'email', required: false, options: [], mapTo: 'email' },
      { key: 'telefono', label: 'Teléfono', type: 'tel', required: false, options: [], mapTo: 'phone' },
    ],
  };

  /** Encola qué devuelve cada `findOne` de contactos: primero email, luego teléfono. */
  const contactsFound = (byEmail: unknown, byPhone: unknown) => {
    customerModel.findOne
      .mockReturnValueOnce({ exec: () => Promise.resolve(byEmail) })
      .mockReturnValueOnce({ exec: () => Promise.resolve(byPhone) });
  };

  const submit = (data: Record<string, unknown>) =>
    service.submit('k', { data }, { pageUrl: 'https://landing.test' });

  beforeEach(async () => {
    formModel = {
      findOne: jest.fn().mockReturnValue({ exec: () => Promise.resolve(form) }),
      updateOne: jest.fn().mockReturnValue({ exec: () => Promise.resolve({}) }),
    };

    // El service hace `new this.customerModel({...}).save()`: el mock es un
    // constructor, y además lleva `findOne` como propiedad.
    const created: Record<string, unknown>[] = [];
    customerModel = Object.assign(
      jest.fn().mockImplementation((attrs: Record<string, unknown>) => {
        const doc = customerDoc({ ...attrs, _id: new Types.ObjectId() });
        created.push(doc);
        return doc;
      }),
      { findOne: jest.fn(), created },
    ) as never;

    submissionModel = { create: jest.fn().mockResolvedValue({}) };
    listModel = {
      updateMany: jest.fn().mockReturnValue({ exec: () => Promise.resolve({}) }),
      find: jest.fn().mockReturnValue({ exec: () => Promise.resolve([]) }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        FormsService,
        { provide: getModelToken(ContactForm.name), useValue: formModel },
        { provide: getModelToken(Customer.name), useValue: customerModel },
        { provide: getModelToken(FormSubmission.name), useValue: submissionModel },
        { provide: getModelToken(ContactList.name), useValue: listModel },
      ],
    }).compile();

    service = moduleRef.get(FormsService);
  });

  it('crea el contacto cuando no existe nada parecido', async () => {
    contactsFound(null, null);
    const res = await submit({ nombre: 'Ana', email: 'ana@test.com', telefono: '999888777' });
    expect(res.created).toBe(true);
    expect(customerModel).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'ana@test.com',
        phone: '+51 999 888 777',
        source: 'form',
      }),
    );
  });

  it('busca por teléfono aunque el envío traiga email: es lo que provocaba el E11000', async () => {
    const previo = customerDoc({ email: 'previo@test.com', phone: '+51 975 760 418' });
    contactsFound(null, previo);

    const res = await submit({
      nombre: 'Visitante',
      email: 'nuevo@test.com',
      telefono: '975760418',
    });

    expect(res.created).toBe(false);
    // No se intenta insertar: ahí estaba el fallo.
    expect(customerModel).not.toHaveBeenCalled();
    expect(previo.save).toHaveBeenCalled();
  });

  it('no pisa el email guardado: archiva el nuevo como campo adicional', async () => {
    const previo = customerDoc({ email: 'previo@test.com', phone: '+51 975 760 418' });
    contactsFound(null, previo);

    await submit({ email: 'nuevo@test.com', telefono: '975760418' });

    expect(previo.email).toBe('previo@test.com');
    expect(previo.customFields).toMatchObject({
      'Email alternativo': 'nuevo@test.com',
    });
  });

  it('archiva el teléfono cuando ya pertenece a otro contacto', async () => {
    const porEmail = customerDoc({ email: 'ana@test.com', phone: '+51 900 000 001' });
    const otro = customerDoc({ email: 'otro@test.com', phone: '+51 999 888 777' });
    contactsFound(porEmail, otro);

    await submit({ email: 'ana@test.com', telefono: '999888777' });

    expect(porEmail.phone).toBe('+51 900 000 001');
    expect(porEmail.customFields).toMatchObject({
      'Teléfono alternativo': '+51 999 888 777',
    });
  });

  it('rellena el hueco cuando el contacto no tenía teléfono', async () => {
    const previo = customerDoc({ email: 'ana@test.com' });
    contactsFound(previo, null);

    await submit({ email: 'ana@test.com', telefono: '999888777' });

    expect(previo.phone).toBe('+51 999 888 777');
    expect(previo.customFields).not.toHaveProperty('Teléfono alternativo');
  });

  it('resuelve la carrera de dos envíos simultáneos sin romper', async () => {
    const ganador = customerDoc({ email: 'ana@test.com', phone: '+51 999 888 777' });
    contactsFound(null, null);
    customerModel.mockImplementationOnce(() => ({
      save: () => Promise.reject(duplicateKeyError()),
    }));
    // Tras el choque el service vuelve a buscar y encuentra al que ganó.
    customerModel.findOne.mockReturnValueOnce({
      exec: () => Promise.resolve(ganador),
    });

    const res = await submit({ email: 'ana@test.com', telefono: '999888777' });

    expect(res.created).toBe(false);
    expect(res.customerId).toBe(String(ganador._id));
  });

  it('da un mensaje legible si el choque no se puede resolver', async () => {
    contactsFound(null, null);
    customerModel.mockImplementationOnce(() => ({
      save: () => Promise.reject(duplicateKeyError()),
    }));
    customerModel.findOne.mockReturnValueOnce({ exec: () => Promise.resolve(null) });

    await expect(
      submit({ email: 'ana@test.com', telefono: '999888777' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('exige email o teléfono para poder identificar a la persona', async () => {
    await expect(submit({ nombre: 'Solo nombre' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('normaliza el teléfono al formato de la plataforma', async () => {
    contactsFound(null, null);
    await submit({ telefono: '(999) 888-777' });
    expect(customerModel).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+51 999 888 777' }),
    );
  });
});
