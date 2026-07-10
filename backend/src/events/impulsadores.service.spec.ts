import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ImpulsadoresService } from './impulsadores.service';
import { Event } from './event.schema';
import { ExternalImpulsador } from './external-impulsador.schema';
import { User } from '../users/user.schema';

// ─── helpers ─────────────────────────────────────────────────────────────────

const tenantOid = new Types.ObjectId();

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
    _id: new Types.ObjectId(),
    tenantId: { toString: () => tenantOid.toString() },
    sharedWith: [] as Types.ObjectId[],
    sharedWithAll: false,
    ...overrides,
  };
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

  return constructor as any;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('ImpulsadoresService', () => {
  let service: ImpulsadoresService;
  let eventModel: any;
  let userModel: any;
  let extModel: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    eventModel = createMockModel(makeEventDoc());
    userModel = createMockModel(null);
    extModel = createMockModel(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImpulsadoresService,
        { provide: getModelToken(Event.name), useValue: eventModel },
        {
          provide: getModelToken(ExternalImpulsador.name),
          useValue: extModel,
        },
        { provide: getModelToken(User.name), useValue: userModel },
      ],
    }).compile();

    service = module.get<ImpulsadoresService>(ImpulsadoresService);
  });

  // ─── resolveAttribution ────────────────────────────────────────────────────

  describe('resolveAttribution', () => {
    it('resolves a valid IMPULSADOR user referral code', async () => {
      const impId = new Types.ObjectId();
      userModel.findOne.mockReturnValue({
        exec: jest
          .fn()
          .mockResolvedValue({ _id: impId, referralCode: 'REF123' }),
      });

      const result = await service.resolveAttribution('REF123', tenantOid);

      expect(userModel.findOne).toHaveBeenCalledWith({
        referralCode: 'REF123',
        tenantId: tenantOid,
        role: 'IMPULSADOR',
        isActive: true,
      });
      expect(result).toEqual({ impulsadorId: impId, impulsadorCode: 'REF123' });
      expect(extModel.findOne).not.toHaveBeenCalled();
    });

    it('falls back to an active external impulsador code (without impulsadorId)', async () => {
      userModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      extModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ code: 'EXT456' }),
      });

      const result = await service.resolveAttribution('EXT456', tenantOid);

      expect(extModel.findOne).toHaveBeenCalledWith({
        code: 'EXT456',
        tenantId: tenantOid,
        active: true,
      });
      expect(result).toEqual({ impulsadorCode: 'EXT456' });
    });

    it('returns no attribution for an invalid code', async () => {
      userModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      extModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.resolveAttribution('NOPE', tenantOid);
      expect(result).toEqual({});
    });
  });

  // ─── findImpulsadores ──────────────────────────────────────────────────────

  describe('findImpulsadores', () => {
    it('throws NotFoundException when event does not exist', async () => {
      eventModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(
        service.findImpulsadores('missing', tenantOid.toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('merges assigned users and external impulsadores', async () => {
      const assignedId = new Types.ObjectId();
      const otherId = new Types.ObjectId();
      eventModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(
          makeEventDoc({
            sharedWith: [assignedId],
            sharedWithAll: false,
          }),
        ),
      });
      userModel.find.mockReturnValue(
        buildQuery([
          {
            _id: assignedId,
            name: 'Impu Asignado',
            email: 'a@t.c',
            referralCode: 'R1',
          },
          {
            _id: otherId,
            name: 'Impu Libre',
            email: 'b@t.c',
            referralCode: 'R2',
          },
        ]),
      );
      extModel.find.mockReturnValue(
        buildQuery([
          { _id: new Types.ObjectId(), name: 'Externo', code: 'X1' },
        ]),
      );

      const result = await service.findImpulsadores(
        new Types.ObjectId().toString(),
        tenantOid.toString(),
      );

      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({ assigned: true, type: 'user' });
      expect(result[1]).toMatchObject({ assigned: false, type: 'user' });
      expect(result[2]).toMatchObject({
        assigned: true,
        type: 'external',
        referralCode: 'X1',
      });
    });
  });

  // ─── createExternalImpulsador ──────────────────────────────────────────────

  describe('createExternalImpulsador', () => {
    it('throws BadRequestException when name is empty', async () => {
      await expect(
        service.createExternalImpulsador(
          tenantOid.toString(),
          new Types.ObjectId().toString(),
          { name: '   ' } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates an external impulsador with a generated 8-char code', async () => {
      let captured: any;
      extModel.mockImplementation((data: any) => {
        captured = data;
        return { ...data, save: jest.fn().mockResolvedValue(data) };
      });

      await service.createExternalImpulsador(
        tenantOid.toString(),
        new Types.ObjectId().toString(),
        { name: '  Externo  ' },
      );

      expect(captured.name).toBe('Externo');
      expect(captured.code).toMatch(/^[A-F0-9]{8}$/);
    });
  });

  // ─── deactivateExternalImpulsador ──────────────────────────────────────────

  describe('deactivateExternalImpulsador', () => {
    it('throws ForbiddenException for wrong tenant', async () => {
      extModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          tenantId: { toString: () => 'other' },
          active: true,
        }),
      });
      await expect(
        service.deactivateExternalImpulsador('id', tenantOid.toString()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('sets active to false and saves', async () => {
      const external = {
        tenantId: { toString: () => tenantOid.toString() },
        active: true,
        save: jest.fn().mockResolvedValue(undefined),
      };
      extModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(external),
      });

      await service.deactivateExternalImpulsador('id', tenantOid.toString());

      expect(external.active).toBe(false);
      expect(external.save).toHaveBeenCalled();
    });
  });
});
