import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { EventsService } from './events.service';
import { Event } from './event.schema';
import { EventRegistration } from './event-registration.schema';
import { EventTemplate } from './event-template.schema';
import { AiService } from '../ai/ai.service';

// ─── helpers ─────────────────────────────────────────────────────────────────

const tenantOid = new Types.ObjectId();
const userOid = new Types.ObjectId();
const localOid = new Types.ObjectId();

const mockAi = {
  chat: jest.fn().mockResolvedValue('{}'),
  parseJson: jest.fn().mockReturnValue({}),
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
  const doc = {
    _id: new Types.ObjectId(),
    tenantId: { toString: () => tenantOid.toString() },
    createdBy: { toString: () => userOid.toString() },
    title: 'Noche de Tapas',
    status: 'published',
    date: new Date('2026-08-01T00:00:00Z'),
    price: 0,
    capacity: 0,
    sharedWith: [] as Types.ObjectId[],
    sharedWithAll: false,
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
  (constructor as any).findByIdAndDelete = jest
    .fn()
    .mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
  (constructor as any).countDocuments = jest.fn().mockResolvedValue(0);
  (constructor as any).deleteMany = jest
    .fn()
    .mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

  return constructor as any;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('EventsService', () => {
  let service: EventsService;
  let eventModel: any;
  let regModel: any;
  let templateModel: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    eventModel = createMockModel(makeEventDoc());
    regModel = createMockModel(null);
    templateModel = createMockModel(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: getModelToken(Event.name), useValue: eventModel },
        {
          provide: getModelToken(EventRegistration.name),
          useValue: regModel,
        },
        {
          provide: getModelToken(EventTemplate.name),
          useValue: templateModel,
        },
        { provide: AiService, useValue: mockAi },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  // ─── createEvent ───────────────────────────────────────────────────────────

  describe('createEvent', () => {
    it('creates an event with a slug derived from the title', async () => {
      let captured: any;
      eventModel.mockImplementation((data: any) => {
        captured = data;
        return { save: jest.fn().mockResolvedValue(data) };
      });

      await service.createEvent(tenantOid.toString(), userOid.toString(), {
        title: '¡Noche de Tapas & Vinos!',
        localId: localOid.toString(),
        date: '2026-08-01',
      } as any);

      expect(captured.slug).toMatch(/^noche-de-tapas-vinos-[a-z0-9]{6}$/);
      expect(captured.tenantId.toString()).toBe(tenantOid.toString());
      expect(captured.createdBy.toString()).toBe(userOid.toString());
      expect(captured.date).toBeInstanceOf(Date);
    });

    it('defaults capacity and price to 0', async () => {
      let captured: any;
      eventModel.mockImplementation((data: any) => {
        captured = data;
        return { save: jest.fn().mockResolvedValue(data) };
      });

      await service.createEvent(tenantOid.toString(), userOid.toString(), {
        title: 'Evento',
        localId: localOid.toString(),
        date: '2026-08-01',
      } as any);

      expect(captured.capacity).toBe(0);
      expect(captured.price).toBe(0);
    });

    it('generates unique slugs for the same title', async () => {
      const slugs: string[] = [];
      eventModel.mockImplementation((data: any) => {
        slugs.push(data.slug);
        return { save: jest.fn().mockResolvedValue(data) };
      });

      const dto = {
        title: 'Mismo Título',
        localId: localOid.toString(),
        date: '2026-08-01',
      } as any;
      await service.createEvent(tenantOid.toString(), userOid.toString(), dto);
      await service.createEvent(tenantOid.toString(), userOid.toString(), dto);

      expect(slugs[0]).not.toBe(slugs[1]);
      expect(slugs[0].startsWith('mismo-titulo-')).toBe(true);
    });
  });

  // ─── findOneEvent ──────────────────────────────────────────────────────────

  describe('findOneEvent', () => {
    it('throws NotFoundException when event does not exist', async () => {
      eventModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(
        service.findOneEvent(
          'missing',
          tenantOid.toString(),
          userOid.toString(),
          'ADMIN',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong tenant', async () => {
      await expect(
        service.findOneEvent(
          'id',
          new Types.ObjectId().toString(),
          userOid.toString(),
          'ADMIN',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── findPublicEvent ───────────────────────────────────────────────────────

  describe('findPublicEvent', () => {
    it('returns the event with confirmed registrations count', async () => {
      regModel.countDocuments.mockResolvedValue(7);
      const result = await service.findPublicEvent('slug-abc123');
      expect(result.registrationsCount).toBe(7);
      expect(eventModel.findOne).toHaveBeenCalledWith({
        slug: 'slug-abc123',
        status: 'published',
      });
    });

    it('throws NotFoundException when slug does not match a published event', async () => {
      eventModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(service.findPublicEvent('bad-slug')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── deleteEvent ───────────────────────────────────────────────────────────

  describe('deleteEvent', () => {
    it('deletes the event and its registrations', async () => {
      const id = new Types.ObjectId().toString();
      await service.deleteEvent(
        id,
        tenantOid.toString(),
        userOid.toString(),
        'ADMIN',
      );
      expect(eventModel.findByIdAndDelete).toHaveBeenCalledWith(id);
      expect(regModel.deleteMany).toHaveBeenCalled();
    });
  });

  // ─── shareEvent ────────────────────────────────────────────────────────────

  describe('shareEvent', () => {
    it('updates sharedWith and sharedWithAll and saves', async () => {
      const event = makeEventDoc();
      eventModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(event),
      });
      const otherUser = new Types.ObjectId().toString();

      await service.shareEvent(
        'id',
        tenantOid.toString(),
        userOid.toString(),
        'ADMIN',
        { sharedWithAll: true, sharedWith: [otherUser] },
      );

      expect(event.sharedWithAll).toBe(true);
      expect(event.sharedWith.map((s) => s.toString())).toEqual([otherUser]);
      expect(event.save).toHaveBeenCalled();
    });
  });
});
