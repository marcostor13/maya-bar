import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { RegistrationsService } from './registrations.service';
import { Event } from './event.schema';
import { EventRegistration } from './event-registration.schema';
import { ExternalImpulsador } from './external-impulsador.schema';
import { User } from '../users/user.schema';
import { MailService } from '../mail/mail.service';
import { ImpulsadoresService } from './impulsadores.service';

// ─── helpers ─────────────────────────────────────────────────────────────────

const tenantOid = new Types.ObjectId();
const eventOid = new Types.ObjectId();

const mockMail = {
  sendEventConfirmationEmail: jest.fn().mockResolvedValue(undefined),
};

const mockImpulsadores = {
  resolveAttribution: jest.fn().mockResolvedValue({}),
};

function buildQuery(result: unknown) {
  const q = {
    sort: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn().mockResolvedValue(result),
  };
  q.sort.mockReturnValue(q);
  q.lean.mockReturnValue(q);
  return q;
}

function makeEventDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: eventOid,
    tenantId: { toString: () => tenantOid.toString() },
    title: 'Noche de Tapas',
    status: 'published',
    capacity: 0,
    date: new Date('2026-08-01T00:00:00Z'),
    startTime: '20:00',
    invitationDesign: undefined as Record<string, unknown> | undefined,
    ...overrides,
  };
}

function makeRegDoc(overrides: Partial<Record<string, unknown>> = {}) {
  const doc = {
    _id: new Types.ObjectId(),
    eventId: { toString: () => eventOid.toString() },
    tenantId: tenantOid,
    name: 'Ana',
    email: 'ana@test.com',
    partySize: 2,
    ticketCode: 'ABCD1234',
    checkedIn: false,
    checkedInAt: undefined as Date | undefined,
    impulsadorCode: undefined as string | undefined,
    toObject: jest.fn().mockReturnThis(),
    save: jest.fn(),
    ...overrides,
  };
  doc.save.mockResolvedValue(doc);
  return doc;
}

function createMockModel(defaultDoc: unknown = null) {
  const constructor = jest.fn().mockImplementation((data: unknown) => ({
    ...(data as object),
    save: jest.fn().mockResolvedValue(defaultDoc ?? data),
  }));

  (constructor as any).find = jest.fn().mockReturnValue(buildQuery([]));
  (constructor as any).findById = jest
    .fn()
    .mockReturnValue({ exec: jest.fn().mockResolvedValue(defaultDoc) });
  (constructor as any).findOne = jest
    .fn()
    .mockReturnValue({ exec: jest.fn().mockResolvedValue(defaultDoc) });
  (constructor as any).countDocuments = jest.fn().mockResolvedValue(0);

  return constructor as any;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('RegistrationsService', () => {
  let service: RegistrationsService;
  let eventModel: any;
  let regModel: any;
  let userModel: any;
  let extModel: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockImpulsadores.resolveAttribution.mockResolvedValue({});

    eventModel = createMockModel(makeEventDoc());
    regModel = createMockModel(makeRegDoc());
    userModel = createMockModel(null);
    extModel = createMockModel(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistrationsService,
        { provide: getModelToken(Event.name), useValue: eventModel },
        {
          provide: getModelToken(EventRegistration.name),
          useValue: regModel,
        },
        {
          provide: getModelToken(ExternalImpulsador.name),
          useValue: extModel,
        },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: ImpulsadoresService, useValue: mockImpulsadores },
        { provide: MailService, useValue: mockMail },
      ],
    }).compile();

    service = module.get<RegistrationsService>(RegistrationsService);
  });

  // ─── registerForEvent ──────────────────────────────────────────────────────

  describe('registerForEvent', () => {
    const dto = { name: 'Ana', email: 'ana@test.com', partySize: 2 } as any;

    it('throws NotFoundException when event does not exist', async () => {
      eventModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(service.registerForEvent('missing', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when event is not published', async () => {
      eventModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(makeEventDoc({ status: 'draft' })),
      });
      await expect(
        service.registerForEvent(eventOid.toString(), dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects registration when the event is full', async () => {
      eventModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(makeEventDoc({ capacity: 10 })),
      });
      regModel.countDocuments.mockResolvedValue(9); // 9 + partySize 2 > 10

      await expect(
        service.registerForEvent(eventOid.toString(), dto),
      ).rejects.toThrow(BadRequestException);
      expect(regModel).not.toHaveBeenCalled();
    });

    it('registers when capacity is 0 (unlimited) without counting seats', async () => {
      eventModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(makeEventDoc({ capacity: 0 })),
      });

      const result = await service.registerForEvent(eventOid.toString(), dto);

      expect(regModel.countDocuments).not.toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(mockMail.sendEventConfirmationEmail).toHaveBeenCalled();
    });

    it('generates an 8-char ticket code and sends confirmation email', async () => {
      let captured: any;
      regModel.mockImplementation((data: any) => {
        captured = data;
        return { ...data, save: jest.fn().mockResolvedValue(data) };
      });

      await service.registerForEvent(eventOid.toString(), dto);

      expect(captured.ticketCode).toMatch(/^[A-Z0-9]{8}$/);
      expect(mockMail.sendEventConfirmationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'ana@test.com',
          eventTitle: 'Noche de Tapas',
          partySize: 2,
        }),
      );
    });

    it('attributes the registration when the ref code resolves', async () => {
      const impId = new Types.ObjectId();
      mockImpulsadores.resolveAttribution.mockResolvedValue({
        impulsadorId: impId,
        impulsadorCode: 'REF123',
      });
      let captured: any;
      regModel.mockImplementation((data: any) => {
        captured = data;
        return { ...data, save: jest.fn().mockResolvedValue(data) };
      });

      await service.registerForEvent(eventOid.toString(), {
        ...dto,
        ref: 'REF123',
      });

      expect(mockImpulsadores.resolveAttribution).toHaveBeenCalledWith(
        'REF123',
        expect.anything(),
      );
      expect(captured.impulsadorCode).toBe('REF123');
      expect(captured.impulsadorId).toBe(impId);
    });

    it('registers without attribution when the ref code is invalid', async () => {
      mockImpulsadores.resolveAttribution.mockResolvedValue({});
      let captured: any;
      regModel.mockImplementation((data: any) => {
        captured = data;
        return { ...data, save: jest.fn().mockResolvedValue(data) };
      });

      await service.registerForEvent(eventOid.toString(), {
        ...dto,
        ref: 'INVALID',
      });

      expect(captured.impulsadorCode).toBeUndefined();
      expect(captured.impulsadorId).toBeUndefined();
    });
  });

  // ─── checkInByCode ─────────────────────────────────────────────────────────

  describe('checkInByCode', () => {
    it('throws NotFoundException for a nonexistent ticket code', async () => {
      regModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(
        service.checkInByCode(eventOid.toString(), tenantOid.toString(), 'ZZ'),
      ).rejects.toThrow(NotFoundException);
    });

    it('checks in a registration on first scan', async () => {
      const reg = makeRegDoc({ checkedIn: false });
      regModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(reg),
      });

      const result = await service.checkInByCode(
        eventOid.toString(),
        tenantOid.toString(),
        ' abcd1234 ',
      );

      expect(regModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ ticketCode: 'ABCD1234' }),
      );
      expect(reg.checkedIn).toBe(true);
      expect(reg.checkedInAt).toBeInstanceOf(Date);
      expect(reg.save).toHaveBeenCalled();
      expect(result.alreadyCheckedIn).toBe(false);
    });

    it('rejects a double check-in (does not save again, flags alreadyCheckedIn)', async () => {
      const reg = makeRegDoc({ checkedIn: true, checkedInAt: new Date() });
      regModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(reg),
      });

      const result = await service.checkInByCode(
        eventOid.toString(),
        tenantOid.toString(),
        'ABCD1234',
      );

      expect(result.alreadyCheckedIn).toBe(true);
      expect(reg.save).not.toHaveBeenCalled();
    });
  });

  // ─── checkIn ───────────────────────────────────────────────────────────────

  describe('checkIn', () => {
    it('throws NotFoundException when registration does not exist', async () => {
      regModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(
        service.checkIn(eventOid.toString(), 'missing', tenantOid.toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when registration belongs to another event', async () => {
      const reg = makeRegDoc({
        eventId: { toString: () => new Types.ObjectId().toString() },
      });
      regModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(reg),
      });
      await expect(
        service.checkIn(eventOid.toString(), 'regId', tenantOid.toString()),
      ).rejects.toThrow(BadRequestException);
    });

    it('marks the registration as checked in', async () => {
      const reg = makeRegDoc();
      regModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(reg),
      });

      await service.checkIn(eventOid.toString(), 'regId', tenantOid.toString());

      expect(reg.checkedIn).toBe(true);
      expect(reg.checkedInAt).toBeInstanceOf(Date);
      expect(reg.save).toHaveBeenCalled();
    });
  });

  // ─── findRegistrations ─────────────────────────────────────────────────────

  describe('findRegistrations', () => {
    it('filters by status and search, resolving impulsador names', async () => {
      const reg = makeRegDoc({ impulsadorCode: 'REF123' });
      regModel.find.mockReturnValue(buildQuery([reg]));
      userModel.find.mockReturnValue(
        buildQuery([{ referralCode: 'REF123', name: 'Impu', email: 'i@t.c' }]),
      );
      extModel.find.mockReturnValue(buildQuery([]));

      const result = await service.findRegistrations(
        eventOid.toString(),
        tenantOid.toString(),
        { status: 'confirmed', search: 'ana' },
      );

      const query = regModel.find.mock.calls[0][0];
      expect(query.status).toBe('confirmed');
      expect(query.$or).toBeDefined();
      expect(result[0].impulsadorName).toBe('Impu');
    });
  });
});
