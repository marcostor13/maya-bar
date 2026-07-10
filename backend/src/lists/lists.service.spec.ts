import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ListsService } from './lists.service';
import { ContactList, SegmentRule } from './contact-list.schema';
import { Customer } from '../customers/customer.schema';

// ─── helpers ─────────────────────────────────────────────────────────────────

const tenantOid = new Types.ObjectId();
const tenantId = tenantOid.toString();
const userOid = new Types.ObjectId();
const userId = userOid.toString();

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

function makeListDoc(overrides: Partial<Record<string, unknown>> = {}) {
  const doc: any = {
    _id: new Types.ObjectId(),
    tenantId: tenantOid,
    name: 'VIPs',
    description: undefined as string | undefined,
    type: 'static',
    rules: [] as SegmentRule[],
    memberIds: [] as Types.ObjectId[],
    memberCount: 0,
    color: '#6366F1',
    createdBy: undefined as Types.ObjectId | undefined,
    save: jest.fn(),
    ...overrides,
  };
  doc.save.mockResolvedValue(doc);
  return doc;
}

function createMockModel() {
  const constructor = jest.fn();
  (constructor as any).find = jest.fn().mockReturnValue(buildQuery([]));
  (constructor as any).findById = jest
    .fn()
    .mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
  (constructor as any).findByIdAndDelete = jest
    .fn()
    .mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
  (constructor as any).countDocuments = jest.fn().mockResolvedValue(0);
  return constructor as any;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('ListsService', () => {
  let service: ListsService;
  let listModel: any;
  let customerModel: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    listModel = createMockModel();
    customerModel = createMockModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListsService,
        { provide: getModelToken(ContactList.name), useValue: listModel },
        { provide: getModelToken(Customer.name), useValue: customerModel },
      ],
    }).compile();

    service = module.get<ListsService>(ListsService);
  });

  function stubFindById(doc: unknown) {
    listModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(doc),
    });
  }

  // ─── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('queries by tenantId sorted by createdAt desc for regular roles', async () => {
      const query = buildQuery([]);
      listModel.find.mockReturnValue(query);

      await service.findAll(tenantId, userId, 'TENANT_ADMIN');

      const filter = listModel.find.mock.calls[0][0];
      expect(Object.keys(filter)).toEqual(['tenantId']);
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    it('restricts to own lists for owner-scoped role (IMPULSADOR)', async () => {
      await service.findAll(tenantId, userId, 'IMPULSADOR');

      const filter = listModel.find.mock.calls[0][0];
      expect(filter.createdBy.toString()).toBe(userId);
    });
  });

  // ─── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the list when tenant matches', async () => {
      const doc = makeListDoc();
      stubFindById(doc);

      const result = await service.findOne(doc._id.toString(), tenantId);
      expect(result).toBe(doc);
    });

    it('throws NotFoundException when list not found', async () => {
      stubFindById(null);
      await expect(service.findOne('x', tenantId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException for wrong tenant', async () => {
      stubFindById(makeListDoc({ tenantId: new Types.ObjectId() }));
      await expect(service.findOne('x', tenantId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException when owner-scoped user is not the creator', async () => {
      stubFindById(makeListDoc({ createdBy: new Types.ObjectId() }));
      await expect(
        service.findOne('x', tenantId, userId, 'IMPULSADOR'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows owner-scoped user to read their own list', async () => {
      const doc = makeListDoc({ createdBy: userOid });
      stubFindById(doc);

      const result = await service.findOne(
        doc._id.toString(),
        tenantId,
        userId,
        'IMPULSADOR',
      );
      expect(result).toBe(doc);
    });
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a static list with defaults and no createdBy for admin roles', async () => {
      let captured: any;
      listModel.mockImplementation((data: any) => {
        captured = data;
        return makeListDoc(data);
      });

      await service.create(tenantId, userId, 'TENANT_ADMIN', {
        name: 'Nueva',
        type: 'static',
      });

      expect(captured.tenantId.toString()).toBe(tenantId);
      expect(captured.rules).toEqual([]);
      expect(captured.memberIds).toEqual([]);
      expect(captured.memberCount).toBe(0);
      expect(captured.color).toBe('#6366F1');
      expect(captured.createdBy).toBeUndefined();
    });

    it('stamps createdBy for owner-scoped role', async () => {
      let captured: any;
      listModel.mockImplementation((data: any) => {
        captured = data;
        return makeListDoc(data);
      });

      await service.create(tenantId, userId, 'IMPULSADOR', {
        name: 'Mía',
        type: 'static',
      });

      expect(captured.createdBy.toString()).toBe(userId);
    });

    it('refreshes memberCount from customer query for dynamic lists with rules', async () => {
      const saved = makeListDoc({
        type: 'dynamic',
        rules: [{ field: 'tags', operator: 'has_any', value: ['vip'] }],
      });
      listModel.mockImplementation(() => saved);
      customerModel.countDocuments.mockResolvedValue(12);

      const result = await service.create(tenantId, userId, 'MANAGER', {
        name: 'Dinámica',
        type: 'dynamic',
        rules: [{ field: 'tags', operator: 'has_any', value: ['vip'] }],
      });

      expect(customerModel.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ tags: { $in: ['vip'] } }),
      );
      expect(result.memberCount).toBe(12);
      expect(saved.save).toHaveBeenCalledTimes(2); // create + refresh
    });

    it('does not refresh count for dynamic list without rules', async () => {
      listModel.mockImplementation(() => makeListDoc({ type: 'dynamic' }));

      await service.create(tenantId, userId, 'MANAGER', {
        name: 'Vacía',
        type: 'dynamic',
      });

      expect(customerModel.countDocuments).not.toHaveBeenCalled();
    });
  });

  // ─── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('assigns dto and saves', async () => {
      const doc = makeListDoc();
      stubFindById(doc);

      await service.update(doc._id.toString(), tenantId, userId, 'MANAGER', {
        name: 'Renombrada',
      });

      expect(doc.name).toBe('Renombrada');
      expect(doc.save).toHaveBeenCalled();
      expect(customerModel.countDocuments).not.toHaveBeenCalled();
    });

    it('re-evaluates memberCount when updating a dynamic list', async () => {
      const doc = makeListDoc({
        type: 'dynamic',
        rules: [{ field: 'source', operator: 'equals', value: 'instagram' }],
      });
      stubFindById(doc);
      customerModel.countDocuments.mockResolvedValue(3);

      const result = await service.update(
        doc._id.toString(),
        tenantId,
        userId,
        'MANAGER',
        {
          rules: [{ field: 'source', operator: 'equals', value: 'instagram' }],
        },
      );

      expect(customerModel.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'instagram' }),
      );
      expect(result.memberCount).toBe(3);
    });

    it('propagates ForbiddenException from ownership check', async () => {
      stubFindById(makeListDoc({ tenantId: new Types.ObjectId() }));
      await expect(
        service.update('x', tenantId, userId, 'MANAGER', {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── delete ─────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes the list after ownership check', async () => {
      const doc = makeListDoc();
      stubFindById(doc);

      await service.delete(doc._id.toString(), tenantId, userId, 'MANAGER');

      expect(listModel.findByIdAndDelete).toHaveBeenCalledWith(doc._id);
    });

    it('throws NotFoundException when list not found', async () => {
      stubFindById(null);
      await expect(
        service.delete('x', tenantId, userId, 'MANAGER'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── addMembers ─────────────────────────────────────────────────────────────

  describe('addMembers', () => {
    it('adds new members, dedupes existing ones and updates memberCount', async () => {
      const existing = new Types.ObjectId();
      const doc = makeListDoc({ memberIds: [existing], memberCount: 1 });
      stubFindById(doc);
      const newId = new Types.ObjectId();

      await service.addMembers(
        doc._id.toString(),
        tenantId,
        userId,
        'MANAGER',
        [existing.toString(), newId.toString()],
      );

      expect(doc.memberIds).toHaveLength(2);
      expect(doc.memberIds.map((m: Types.ObjectId) => m.toString())).toEqual([
        existing.toString(),
        newId.toString(),
      ]);
      expect(doc.memberCount).toBe(2);
      expect(doc.save).toHaveBeenCalled();
    });

    it('rejects adding members to a dynamic list', async () => {
      stubFindById(makeListDoc({ type: 'dynamic' }));
      await expect(
        service.addMembers('x', tenantId, userId, 'MANAGER', [
          new Types.ObjectId().toString(),
        ]),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── removeMember ───────────────────────────────────────────────────────────

  describe('removeMember', () => {
    it('removes the member and updates memberCount', async () => {
      const keep = new Types.ObjectId();
      const remove = new Types.ObjectId();
      const doc = makeListDoc({ memberIds: [keep, remove], memberCount: 2 });
      stubFindById(doc);

      await service.removeMember(
        doc._id.toString(),
        remove.toString(),
        tenantId,
        userId,
        'MANAGER',
      );

      expect(doc.memberIds.map((m: Types.ObjectId) => m.toString())).toEqual([
        keep.toString(),
      ]);
      expect(doc.memberCount).toBe(1);
    });

    it('rejects removing from a dynamic list', async () => {
      stubFindById(makeListDoc({ type: 'dynamic' }));
      await expect(
        service.removeMember('x', 'cid', tenantId, userId, 'MANAGER'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── getMembers ─────────────────────────────────────────────────────────────

  describe('getMembers', () => {
    it('queries members by ids for static lists', async () => {
      const m1 = new Types.ObjectId();
      const doc = makeListDoc({ memberIds: [m1] });
      stubFindById(doc);
      customerModel.find.mockReturnValue(buildQuery([{ _id: m1 }]));

      const result = await service.getMembers(doc._id.toString(), tenantId);

      const filter = customerModel.find.mock.calls[0][0];
      expect(filter._id).toEqual({ $in: [m1] });
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(result).toHaveLength(1);
    });

    it('queries by built rule filter for dynamic lists', async () => {
      const doc = makeListDoc({
        type: 'dynamic',
        rules: [{ field: 'totalReservations', operator: 'gte', value: 3 }],
      });
      stubFindById(doc);

      await service.getMembers(doc._id.toString(), tenantId);

      const filter = customerModel.find.mock.calls[0][0];
      expect(filter.totalReservations).toEqual({ $gte: 3 });
    });
  });

  // ─── previewCount / previewRules ───────────────────────────────────────────

  describe('previewCount', () => {
    it('returns stored memberCount for static lists without querying', async () => {
      stubFindById(makeListDoc({ memberCount: 8 }));

      const result = await service.previewCount('x', tenantId);

      expect(result).toEqual({ count: 8 });
      expect(customerModel.countDocuments).not.toHaveBeenCalled();
    });

    it('counts customers matching rules for dynamic lists', async () => {
      stubFindById(
        makeListDoc({
          type: 'dynamic',
          rules: [{ field: 'tags', operator: 'has_any', value: ['vip'] }],
        }),
      );
      customerModel.countDocuments.mockResolvedValue(4);

      const result = await service.previewCount('x', tenantId);
      expect(result).toEqual({ count: 4 });
    });
  });

  describe('previewRules (segmentation filter building)', () => {
    async function filterFor(rules: SegmentRule[]) {
      await service.previewRules(tenantId, rules);
      return customerModel.countDocuments.mock.calls[0][0];
    }

    it('always scopes by tenantId', async () => {
      const filter = await filterFor([]);
      expect(Object.keys(filter)).toEqual(['tenantId']);
      expect(filter.tenantId.toString()).toBe(tenantId);
    });

    it('tags has_any builds $in and wraps scalar values in an array', async () => {
      const filter = await filterFor([
        { field: 'tags', operator: 'has_any', value: 'vip' },
      ]);
      expect(filter.tags).toEqual({ $in: ['vip'] });
    });

    it('tags has_all builds $all', async () => {
      const filter = await filterFor([
        { field: 'tags', operator: 'has_all', value: ['vip', 'evento'] },
      ]);
      expect(filter.tags).toEqual({ $all: ['vip', 'evento'] });
    });

    it('source equals / not_equals build direct and $ne filters', async () => {
      const filter = await filterFor([
        { field: 'source', operator: 'not_equals', value: 'walk-in' },
      ]);
      expect(filter.source).toEqual({ $ne: 'walk-in' });
    });

    it('numeric fields coerce string values to numbers', async () => {
      const filter = await filterFor([
        { field: 'totalReservations', operator: 'gte', value: '5' },
        { field: 'totalEvents', operator: 'lte', value: '2' },
      ]);
      expect(filter.totalReservations).toEqual({ $gte: 5 });
      expect(filter.totalEvents).toEqual({ $lte: 2 });
    });

    it('daysSinceLastVisit gte maps to lastVisit $lte cutoff date (inactive customers)', async () => {
      const before = Date.now();
      const filter = await filterFor([
        { field: 'daysSinceLastVisit', operator: 'gte', value: 30 },
      ]);
      const cutoff = (filter.lastVisit as { $lte: Date }).$lte;
      const expected = before - 30 * 86_400_000;
      expect(Math.abs(cutoff.getTime() - expected)).toBeLessThan(5000);
    });

    it('daysSinceLastVisit lte maps to lastVisit $gte cutoff date (recent customers)', async () => {
      const before = Date.now();
      const filter = await filterFor([
        { field: 'daysSinceLastVisit', operator: 'lte', value: 7 },
      ]);
      const cutoff = (filter.lastVisit as { $gte: Date }).$gte;
      const expected = before - 7 * 86_400_000;
      expect(Math.abs(cutoff.getTime() - expected)).toBeLessThan(5000);
    });

    it('ignores unsupported field/operator combinations', async () => {
      const filter = await filterFor([
        { field: 'tags', operator: 'equals', value: 'vip' },
      ]);
      expect(filter.tags).toBeUndefined();
    });

    it('combines multiple rules into a single filter', async () => {
      const filter = await filterFor([
        { field: 'tags', operator: 'has_any', value: ['vip'] },
        { field: 'source', operator: 'equals', value: 'instagram' },
        { field: 'totalReservations', operator: 'equals', value: 2 },
      ]);
      expect(filter.tags).toEqual({ $in: ['vip'] });
      expect(filter.source).toBe('instagram');
      expect(filter.totalReservations).toBe(2);
    });
  });

  // ─── resolveCustomers / previewCountForLists ───────────────────────────────

  describe('resolveCustomers', () => {
    it('merges members across lists deduplicating by customer id', async () => {
      const shared = { _id: new Types.ObjectId() };
      const only1 = { _id: new Types.ObjectId() };
      const only2 = { _id: new Types.ObjectId() };
      jest
        .spyOn(service, 'getMembers')
        .mockResolvedValueOnce([shared, only1] as never)
        .mockResolvedValueOnce([shared, only2] as never);

      const result = await service.resolveCustomers(['l1', 'l2'], tenantId);

      expect(result).toHaveLength(3);
    });

    it('skips lists that fail to resolve instead of aborting', async () => {
      const c1 = { _id: new Types.ObjectId() };
      jest
        .spyOn(service, 'getMembers')
        .mockRejectedValueOnce(new NotFoundException())
        .mockResolvedValueOnce([c1] as never);

      const result = await service.resolveCustomers(['bad', 'ok'], tenantId);

      expect(result).toHaveLength(1);
    });
  });

  describe('previewCountForLists', () => {
    it('returns the deduplicated customer count', async () => {
      const shared = { _id: new Types.ObjectId() };
      jest
        .spyOn(service, 'getMembers')
        .mockResolvedValueOnce([shared] as never)
        .mockResolvedValueOnce([shared] as never);

      const result = await service.previewCountForLists(['l1', 'l2'], tenantId);
      expect(result).toEqual({ count: 1 });
    });
  });

  describe('reglas combinadas sobre el mismo campo', () => {
    it('gte + lte componen un rango en vez de sobrescribirse', async () => {
      customerModel.countDocuments.mockResolvedValue(2);

      await service.previewRules(tenantId, [
        { field: 'totalReservations', operator: 'gte', value: 2 },
        { field: 'totalReservations', operator: 'lte', value: 5 },
      ] as any);

      const filter = customerModel.countDocuments.mock.calls[0][0];
      expect(filter.totalReservations).toEqual({ $gte: 2, $lte: 5 });
    });
  });
});
