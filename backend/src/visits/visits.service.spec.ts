import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { VisitsService } from './visits.service';

// ─── helpers ─────────────────────────────────────────────────────────────────

const tenantOid = new Types.ObjectId();
const tenantId = tenantOid.toString();
const userOid = new Types.ObjectId();
const userId = userOid.toString();

function buildQuery(result: unknown) {
  const q: Record<string, jest.Mock> = {};
  for (const m of ['sort', 'limit']) q[m] = jest.fn(() => q);
  q.exec = jest.fn().mockResolvedValue(result);
  return q;
}

function makeVisitDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    tenantId: tenantOid,
    impulsadorId: userOid,
    reference: 'Bodega Don Pepe',
    ...overrides,
  };
}

function createMockModel() {
  const model: any = jest.fn();
  model.find = jest.fn().mockReturnValue(buildQuery([]));
  model.findById = jest.fn().mockReturnValue(buildQuery(null));
  model.findByIdAndDelete = jest.fn().mockReturnValue(buildQuery(null));
  model.countDocuments = jest.fn().mockResolvedValue(0);
  return model;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('VisitsService', () => {
  let service: VisitsService;
  let visitModel: any;
  let customerModel: any;

  beforeEach(() => {
    visitModel = createMockModel();
    customerModel = createMockModel();
    service = new VisitsService(visitModel as never, customerModel as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('registra la visita a nombre del impulsador y de su empresa', async () => {
      let captured: any;
      visitModel.mockImplementation((data: any) => {
        captured = data;
        return { ...data, save: jest.fn().mockResolvedValue(data) };
      });

      await service.create(tenantId, userId, {
        reference: 'Bodega Don Pepe',
        location: { lat: -12.05, lng: -77.04, accuracy: 8 },
        address: 'Jr. Unión 100',
      });

      expect(captured.tenantId.toString()).toBe(tenantId);
      expect(captured.impulsadorId.toString()).toBe(userId);
      expect(captured).toMatchObject({
        reference: 'Bodega Don Pepe',
        location: { lat: -12.05, lng: -77.04, accuracy: 8 },
        address: 'Jr. Unión 100',
      });
    });

    it('la empresa y el impulsador del token mandan sobre los del cuerpo', async () => {
      let captured: any;
      visitModel.mockImplementation((data: any) => {
        captured = data;
        return { save: jest.fn().mockResolvedValue(data) };
      });

      await service.create(tenantId, userId, {
        reference: 'X',
        location: { lat: 0, lng: 0 },
        tenantId: new Types.ObjectId().toString(),
        impulsadorId: new Types.ObjectId().toString(),
      } as never);

      expect(captured.tenantId.toString()).toBe(tenantId);
      expect(captured.impulsadorId.toString()).toBe(userId);
    });
  });

  // ─── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('gestión ve las últimas 200 visitas de toda la empresa', async () => {
      const query = buildQuery([]);
      visitModel.find.mockReturnValue(query);

      await service.findAll(tenantId, userId, 'MANAGER');

      const filter = visitModel.find.mock.calls[0][0];
      expect(Object.keys(filter)).toEqual(['tenantId']);
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(query.limit).toHaveBeenCalledWith(200);
    });

    it('el impulsador solo ve sus visitas', async () => {
      await service.findAll(tenantId, userId, 'IMPULSADOR');

      const filter = visitModel.find.mock.calls[0][0];
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(filter.impulsadorId.toString()).toBe(userId);
    });
  });

  // ─── delete ─────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('borra la visita de la empresa', async () => {
      const doc = makeVisitDoc({ impulsadorId: new Types.ObjectId() });
      visitModel.findById.mockReturnValue(buildQuery(doc));
      const id = doc._id.toString();

      await service.delete(id, tenantId, userId, 'MANAGER');

      expect(visitModel.findByIdAndDelete).toHaveBeenCalledWith(id);
    });

    it('una visita que ya no existe se da por borrada sin error', async () => {
      await expect(
        service.delete('x', tenantId, userId, 'MANAGER'),
      ).resolves.toBeUndefined();
      expect(visitModel.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it('una visita de otra empresa no se borra', async () => {
      visitModel.findById.mockReturnValue(
        buildQuery(makeVisitDoc({ tenantId: new Types.ObjectId() })),
      );

      await expect(
        service.delete('x', tenantId, userId, 'TENANT_ADMIN'),
      ).rejects.toThrow(ForbiddenException);
      expect(visitModel.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it('el impulsador no borra visitas de un compañero', async () => {
      visitModel.findById.mockReturnValue(
        buildQuery(makeVisitDoc({ impulsadorId: new Types.ObjectId() })),
      );

      await expect(
        service.delete('x', tenantId, userId, 'IMPULSADOR'),
      ).rejects.toThrow(ForbiddenException);
      expect(visitModel.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it('el impulsador sí borra las suyas', async () => {
      const doc = makeVisitDoc();
      visitModel.findById.mockReturnValue(buildQuery(doc));

      await service.delete(doc._id.toString(), tenantId, userId, 'IMPULSADOR');

      expect(visitModel.findByIdAndDelete).toHaveBeenCalledTimes(1);
    });
  });

  // ─── getStats ───────────────────────────────────────────────────────────────

  describe('getStats', () => {
    beforeEach(() => {
      // Miércoles 14 de enero de 2026, 15:30 hora local.
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2026, 0, 14, 15, 30, 0));
    });

    it('cuenta hoy, semana (desde el domingo) y mes dentro de la empresa', async () => {
      visitModel.countDocuments
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(9)
        .mockResolvedValueOnce(31);
      customerModel.countDocuments.mockResolvedValue(120);

      const stats = await service.getStats(tenantId, userId, 'MANAGER');

      expect(stats).toEqual({
        today: 2,
        week: 9,
        month: 31,
        contacts: 120,
        eventRegistrations: 0,
      });
      const filters = visitModel.countDocuments.mock.calls.map(
        (c: unknown[]) => c[0],
      );
      expect(filters.map((f: any) => f.createdAt.$gte)).toEqual([
        new Date(2026, 0, 14),
        new Date(2026, 0, 11),
        new Date(2026, 0, 1),
      ]);
      for (const filter of filters) {
        expect(Object.keys(filter).sort()).toEqual(['createdAt', 'tenantId']);
        expect(filter.tenantId.toString()).toBe(tenantId);
      }
      const customerFilter = customerModel.countDocuments.mock.calls[0][0];
      expect(Object.keys(customerFilter)).toEqual(['tenantId']);
      expect(customerFilter.tenantId.toString()).toBe(tenantId);
    });

    it('el impulsador solo cuenta sus visitas y sus contactos', async () => {
      await service.getStats(tenantId, userId, 'IMPULSADOR');

      for (const [filter] of visitModel.countDocuments.mock.calls) {
        expect(filter.tenantId.toString()).toBe(tenantId);
        expect(filter.impulsadorId.toString()).toBe(userId);
      }
      const customerFilter = customerModel.countDocuments.mock.calls[0][0];
      expect(customerFilter.tenantId.toString()).toBe(tenantId);
      expect(customerFilter.createdBy.toString()).toBe(userId);
    });
  });
});
