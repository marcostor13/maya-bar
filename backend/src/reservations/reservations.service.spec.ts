import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ReservationsService } from './reservations.service';
import { Reservation } from './reservation.schema';
import { Local } from '../locals/local.schema';
import { MailService } from '../mail/mail.service';

const tenantOid = new Types.ObjectId();
const localOid = new Types.ObjectId();

const defaultConfig = {
  enabled: true,
  turnos: ['12:00', '13:30', '20:00'],
  defaultDuration: 90,
  maxPerTurno: 3,
  maxPartySize: 8,
  advanceBookingDays: 30,
};

function makeLocalDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: localOid,
    tenantId: { toString: () => tenantOid.toString() },
    name: 'Local Test',
    isActive: true,
    reservationConfig: { ...defaultConfig },
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeResDoc(overrides: Partial<Record<string, unknown>> = {}) {
  const doc = {
    _id: new Types.ObjectId().toString(),
    tenantId: { toString: () => tenantOid.toString() },
    localId: localOid,
    date: '2026-06-15',
    turno: '20:00',
    partySize: 2,
    guestName: 'Ana Torres',
    guestEmail: 'ana@test.com',
    status: 'pending',
    statusHistory: [] as any[],
    confirmationToken: 'abc123',
    toObject: jest.fn().mockReturnThis(),
    save: jest.fn(),
    ...overrides,
  };
  doc.save.mockResolvedValue(doc);
  return doc;
}

function buildQuery(result: unknown) {
  const q = { sort: jest.fn(), exec: jest.fn().mockResolvedValue(result) };
  q.sort.mockReturnValue(q);
  return q;
}

function createMockModel(defaultDoc: unknown = null) {
  const constructor = jest.fn().mockImplementation(() => ({
    save: jest.fn().mockResolvedValue(defaultDoc),
    ...(typeof defaultDoc === 'object' && defaultDoc !== null
      ? defaultDoc
      : {}),
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

describe('ReservationsService', () => {
  let service: ReservationsService;
  let reservationModel: any;
  let localModel: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const resDoc = makeResDoc();
    const localDoc = makeLocalDoc();

    reservationModel = createMockModel(resDoc);
    localModel = createMockModel(localDoc);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        {
          provide: getModelToken(Reservation.name),
          useValue: reservationModel,
        },
        { provide: getModelToken(Local.name), useValue: localModel },
        { provide: MailService, useValue: { sendReservationEmail: jest.fn(), sendPasswordResetEmail: jest.fn() } },
      ],
    }).compile();

    service = module.get<ReservationsService>(ReservationsService);
  });

  // ─── getAvailability ──────────────────────────────────────────────────────

  describe('getAvailability', () => {
    it('returns slots with availability', async () => {
      reservationModel.find.mockReturnValue(buildQuery([]));
      const slots = await service.getAvailability(
        localOid.toString(),
        '2026-06-15',
      );
      expect(slots).toHaveLength(3);
      expect(slots[0].turno).toBe('12:00');
      expect(slots[0].available).toBe(true);
      expect(slots[0].spotsLeft).toBe(3);
    });

    it('marks slot as unavailable when maxPerTurno reached', async () => {
      const bookings = Array.from({ length: 3 }, () =>
        makeResDoc({ turno: '12:00', status: 'confirmed' }),
      );
      reservationModel.find.mockReturnValue(buildQuery(bookings));
      const slots = await service.getAvailability(
        localOid.toString(),
        '2026-06-15',
      );
      expect(slots.find((s) => s.turno === '12:00')?.available).toBe(false);
      expect(slots.find((s) => s.turno === '13:30')?.available).toBe(true);
    });

    it('returns empty array when reservations disabled', async () => {
      const local = makeLocalDoc({
        reservationConfig: { ...defaultConfig, enabled: false },
      });
      localModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(local),
      });
      const slots = await service.getAvailability(
        localOid.toString(),
        '2026-06-15',
      );
      expect(slots).toHaveLength(0);
    });

    it('throws NotFoundException for unknown local', async () => {
      localModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(
        service.getAvailability('bad', '2026-06-15'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getPublicConfig ──────────────────────────────────────────────────────

  describe('getPublicConfig', () => {
    it('returns local name and config', async () => {
      const result = await service.getPublicConfig(localOid.toString());
      expect(result.localName).toBe('Local Test');
      expect(result.config.turnos).toHaveLength(3);
    });

    it('throws NotFoundException for unknown local', async () => {
      localModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(service.getPublicConfig('bad')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── createReservation ────────────────────────────────────────────────────

  describe('createReservation', () => {
    const dto = {
      localId: localOid.toString(),
      date: '2026-06-15',
      turno: '20:00',
      partySize: 2,
      guestName: 'Ana Torres',
      guestEmail: 'ana@test.com',
    };

    it('creates and saves a reservation', async () => {
      const result = await service.createReservation(dto);
      expect(result).toBeDefined();
      expect(localModel.findById).toHaveBeenCalledWith(dto.localId);
    });

    it('throws BadRequestException when reservations are disabled', async () => {
      const local = makeLocalDoc({
        reservationConfig: { ...defaultConfig, enabled: false },
      });
      localModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(local),
      });
      await expect(service.createReservation(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when turno is not available', async () => {
      await expect(
        service.createReservation({ ...dto, turno: '99:99' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when party size exceeds max', async () => {
      await expect(
        service.createReservation({ ...dto, partySize: 20 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when turno is full', async () => {
      reservationModel.countDocuments.mockResolvedValue(3);
      await expect(service.createReservation(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when local not found', async () => {
      localModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(service.createReservation(dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getByToken ───────────────────────────────────────────────────────────

  describe('getByToken', () => {
    it('returns reservation with local name', async () => {
      const res = makeResDoc();
      reservationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(res),
      });
      const result = await service.getByToken('abc123');
      expect(result).toBeDefined();
    });

    it('throws NotFoundException for unknown token', async () => {
      reservationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(service.getByToken('bad-token')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── confirmByToken ───────────────────────────────────────────────────────

  describe('confirmByToken', () => {
    it('confirms a pending reservation', async () => {
      const res = makeResDoc({ status: 'pending' });
      reservationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(res),
      });
      await service.confirmByToken('abc123');
      expect(res.status).toBe('confirmed');
      expect(res.save).toHaveBeenCalled();
    });

    it('returns already confirmed reservation without re-saving', async () => {
      const res = makeResDoc({ status: 'confirmed' });
      reservationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(res),
      });
      const result = await service.confirmByToken('abc123');
      expect(result.status).toBe('confirmed');
      expect(res.save).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for cancelled reservation', async () => {
      const res = makeResDoc({ status: 'cancelled' });
      reservationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(res),
      });
      await expect(service.confirmByToken('abc123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException for unknown token', async () => {
      reservationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(service.confirmByToken('bad')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── findReservations ─────────────────────────────────────────────────────

  describe('findReservations', () => {
    it('queries with tenantId and localId', async () => {
      await service.findReservations(tenantOid.toString(), localOid.toString());
      expect(reservationModel.find).toHaveBeenCalled();
    });

    it('includes date filter when provided', async () => {
      await service.findReservations(
        tenantOid.toString(),
        localOid.toString(),
        '2026-06-15',
      );
      const callArg = reservationModel.find.mock.calls[0][0];
      expect(callArg.date).toBe('2026-06-15');
    });

    it('includes status filter when provided', async () => {
      await service.findReservations(
        tenantOid.toString(),
        localOid.toString(),
        undefined,
        'confirmed',
      );
      const callArg = reservationModel.find.mock.calls[0][0];
      expect(callArg.status).toBe('confirmed');
    });
  });

  // ─── updateStatus ─────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('updates status and appends to history', async () => {
      const res = makeResDoc();
      reservationModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(res),
      });
      await service.updateStatus('id', tenantOid.toString(), 'confirmed');
      expect(res.status).toBe('confirmed');
      expect(res.statusHistory).toHaveLength(1);
    });

    it('throws NotFoundException when not found', async () => {
      reservationModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(
        service.updateStatus('bad', tenantOid.toString(), 'confirmed'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong tenant', async () => {
      const res = makeResDoc({ tenantId: { toString: () => 'other' } });
      reservationModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(res),
      });
      await expect(
        service.updateStatus('id', tenantOid.toString(), 'confirmed'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── getConfig / updateConfig ─────────────────────────────────────────────

  describe('getConfig', () => {
    it('returns reservation config', async () => {
      const cfg = await service.getConfig(
        localOid.toString(),
        tenantOid.toString(),
      );
      expect(cfg.turnos).toHaveLength(3);
      expect(cfg.enabled).toBe(true);
    });

    it('throws NotFoundException when local not found', async () => {
      localModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(
        service.getConfig('bad', tenantOid.toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong tenant', async () => {
      const local = makeLocalDoc({ tenantId: { toString: () => 'other' } });
      localModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(local),
      });
      await expect(
        service.getConfig(localOid.toString(), tenantOid.toString()),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateConfig', () => {
    it('saves updated config and returns it', async () => {
      const local = makeLocalDoc();
      local.save = jest.fn().mockResolvedValue(local);
      localModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(local),
      });

      const dto = {
        localId: localOid.toString(),
        enabled: true,
        turnos: ['18:00', '21:00'],
        defaultDuration: 120,
        maxPerTurno: 5,
        maxPartySize: 12,
        advanceBookingDays: 14,
      };
      const result = await service.updateConfig(tenantOid.toString(), dto);
      expect(result.turnos).toEqual(['18:00', '21:00']);
      expect(local.save).toHaveBeenCalled();
    });

    it('throws ForbiddenException for wrong tenant', async () => {
      const local = makeLocalDoc({ tenantId: { toString: () => 'other' } });
      localModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(local),
      });
      await expect(
        service.updateConfig(tenantOid.toString(), {
          localId: localOid.toString(),
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
