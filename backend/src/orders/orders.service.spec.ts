import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { OrdersService } from './orders.service';
import { Order } from './order.schema';
import { Local } from '../locals/local.schema';
import { MenuCategory } from '../menu/menu-category.schema';
import { MenuItem } from '../menu/menu-item.schema';
import { OrdersGateway } from './orders.gateway';

// ─── helpers ─────────────────────────────────────────────────────────────────

const tenantOid = new Types.ObjectId();
const localOid = new Types.ObjectId();

const mockGateway = {
  emitOrderNew: jest.fn(),
  emitOrderUpdated: jest.fn(),
};

function buildQuery(result: unknown) {
  const q = {
    sort: jest.fn(),
    exec: jest.fn().mockResolvedValue(result),
  };
  q.sort.mockReturnValue(q);
  return q;
}

function makeOrderDoc(overrides: Partial<Record<string, unknown>> = {}) {
  const doc = {
    _id: new Types.ObjectId().toString(),
    tenantId: { toString: () => tenantOid.toString() },
    localId: localOid,
    tableNumber: '3',
    type: 'dine-in',
    status: 'pending',
    items: [],
    subtotal: 0,
    total: 0,
    statusHistory: [] as { status: string; at: Date }[],
    callWaiter: false,
    callBill: false,
    notes: undefined as string | undefined,
    toObject: jest.fn().mockReturnThis(),
    save: jest.fn(),
    ...overrides,
  };
  doc.save.mockResolvedValue(doc);
  return doc;
}

function makeLocalDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: localOid,
    tenantId: { toString: () => tenantOid.toString() },
    name: 'Local Test',
    isActive: true,
    tableCount: 5,
    ...overrides,
  };
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
  (constructor as any).countDocuments = jest.fn().mockResolvedValue(0);
  (constructor as any).deleteMany = jest
    .fn()
    .mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

  return constructor as any;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('OrdersService', () => {
  let service: OrdersService;
  let orderModel: any;
  let localModel: any;
  let categoryModel: any;
  let itemModel: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const orderDoc = makeOrderDoc();
    const localDoc = makeLocalDoc();

    orderModel = createMockModel(orderDoc);
    localModel = createMockModel(localDoc);
    categoryModel = createMockModel([]);
    itemModel = createMockModel([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getModelToken(Order.name), useValue: orderModel },
        { provide: getModelToken(Local.name), useValue: localModel },
        { provide: getModelToken(MenuCategory.name), useValue: categoryModel },
        { provide: getModelToken(MenuItem.name), useValue: itemModel },
        { provide: OrdersGateway, useValue: mockGateway },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  // ─── createOrder ───────────────────────────────────────────────────────────

  describe('createOrder', () => {
    it('creates and saves an order when local exists', async () => {
      const dto = {
        localId: localOid.toString(),
        tableNumber: '3',
        items: [
          {
            itemId: 'i1',
            name: 'Pizza',
            price: 25,
            quantity: 2,
            stations: ['kitchen'],
          },
        ],
      };

      const result = await service.createOrder(dto);
      expect(localModel.findById).toHaveBeenCalledWith(dto.localId);
      expect(result).toBeDefined();
    });

    it('emits order:new event via gateway', async () => {
      const dto = {
        localId: localOid.toString(),
        tableNumber: '3',
        items: [
          {
            itemId: 'i1',
            name: 'Pizza',
            price: 25,
            quantity: 2,
            stations: ['kitchen'],
          },
        ],
      };
      await service.createOrder(dto);
      expect(mockGateway.emitOrderNew).toHaveBeenCalled();
    });

    it('throws NotFoundException when local is not found', async () => {
      localModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.createOrder({ localId: 'bad', tableNumber: '1', items: [] }),
      ).rejects.toThrow(NotFoundException);
    });

    it('calculates subtotal correctly', async () => {
      const dto = {
        localId: localOid.toString(),
        tableNumber: '1',
        items: [
          {
            itemId: 'a',
            name: 'Burger',
            price: 20,
            quantity: 3,
            stations: ['kitchen'],
          },
          {
            itemId: 'b',
            name: 'Beer',
            price: 10,
            quantity: 2,
            stations: ['bar'],
          },
        ],
      };

      const savedOrder = makeOrderDoc({ subtotal: 80, total: 80 });
      const constructedOrder = {
        save: jest.fn().mockResolvedValue(savedOrder),
      };
      orderModel.mockImplementation(() => constructedOrder);

      await service.createOrder(dto);
      expect(constructedOrder.save).toHaveBeenCalled();
    });

    it('defaults type to dine-in when not provided', async () => {
      const dto = { localId: localOid.toString(), tableNumber: '2', items: [] };
      let captured: any;
      orderModel.mockImplementation((data: any) => {
        captured = data;
        return { save: jest.fn().mockResolvedValue(makeOrderDoc()) };
      });

      await service.createOrder(dto);
      expect(captured.type).toBe('dine-in');
    });
  });

  // ─── findOrderById ─────────────────────────────────────────────────────────

  describe('findOrderById', () => {
    it('returns order when found', async () => {
      const result = await service.findOrderById('some-id');
      expect(result).toBeDefined();
    });

    it('throws NotFoundException when order not found', async () => {
      orderModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(service.findOrderById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── findOrders ────────────────────────────────────────────────────────────

  describe('findOrders', () => {
    it('queries by tenantId and localId', async () => {
      const tid = tenantOid.toString();
      const lid = localOid.toString();
      await service.findOrders(tid, lid);
      expect(orderModel.find).toHaveBeenCalled();
    });

    it('includes status filter when provided', async () => {
      await service.findOrders(
        tenantOid.toString(),
        localOid.toString(),
        'pending',
      );
      const callArg = orderModel.find.mock.calls[0][0];
      expect(callArg.status).toBe('pending');
    });

    it('omits status filter when not provided', async () => {
      await service.findOrders(tenantOid.toString(), localOid.toString());
      const callArg = orderModel.find.mock.calls[0][0];
      expect(callArg.status).toBeUndefined();
    });
  });

  // ─── updateStatus ──────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('updates order status and appends to history', async () => {
      const order = makeOrderDoc();
      orderModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(order),
      });

      await service.updateStatus('id', tenantOid.toString(), 'preparing');

      expect(order.status).toBe('preparing');
      expect(order.statusHistory).toHaveLength(1);
      expect(order.save).toHaveBeenCalled();
    });

    it('emits order:updated event via gateway', async () => {
      const order = makeOrderDoc();
      orderModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(order),
      });
      await service.updateStatus('id', tenantOid.toString(), 'preparing');
      expect(mockGateway.emitOrderUpdated).toHaveBeenCalled();
    });

    it('throws NotFoundException when order not found', async () => {
      orderModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(
        service.updateStatus('missing', tenantOid.toString(), 'preparing'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong tenant', async () => {
      const order = makeOrderDoc({
        tenantId: { toString: () => 'other-tenant' },
      });
      orderModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(order),
      });
      await expect(
        service.updateStatus('id', tenantOid.toString(), 'preparing'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── modifyOrder ───────────────────────────────────────────────────────────

  describe('modifyOrder', () => {
    it('modifies items and recalculates total when status is pending', async () => {
      const order = makeOrderDoc({ status: 'pending' });
      orderModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(order),
      });

      const items = [
        {
          itemId: 'i1',
          name: 'Lomo',
          price: 40,
          quantity: 2,
          stations: ['kitchen'],
          subtotal: 80,
        },
      ] as any;
      await service.modifyOrder('id', tenantOid.toString(), items);

      expect(order.items).toEqual(items);
      expect(order.total).toBe(80);
      expect(order.save).toHaveBeenCalled();
    });

    it('throws BadRequestException when order is not pending', async () => {
      const order = makeOrderDoc({ status: 'preparing' });
      orderModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(order),
      });

      await expect(
        service.modifyOrder('id', tenantOid.toString(), []),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when order not found', async () => {
      orderModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(
        service.modifyOrder('missing', tenantOid.toString(), []),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong tenant', async () => {
      const order = makeOrderDoc({
        tenantId: { toString: () => 'other' },
        status: 'pending',
      });
      orderModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(order),
      });
      await expect(
        service.modifyOrder('id', tenantOid.toString(), []),
      ).rejects.toThrow(ForbiddenException);
    });

    it('updates notes when provided', async () => {
      const order = makeOrderDoc({ status: 'pending' });
      orderModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(order),
      });
      await service.modifyOrder('id', tenantOid.toString(), [], 'sin sal');
      expect(order.notes).toBe('sin sal');
    });
  });

  // ─── cancelOrder ───────────────────────────────────────────────────────────

  describe('cancelOrder', () => {
    it('delegates to updateStatus with cancelled status', async () => {
      const order = makeOrderDoc();
      orderModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(order),
      });

      await service.cancelOrder('id', tenantOid.toString());
      expect(order.status).toBe('cancelled');
    });
  });

  // ─── callWaiter ────────────────────────────────────────────────────────────

  describe('callWaiter', () => {
    it('sets callWaiter to true and emits event', async () => {
      const order = makeOrderDoc();
      orderModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(order),
      });

      await service.callWaiter('id');
      expect(order.callWaiter).toBe(true);
      expect(order.save).toHaveBeenCalled();
      expect(mockGateway.emitOrderUpdated).toHaveBeenCalled();
    });

    it('throws NotFoundException when order not found', async () => {
      orderModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(service.callWaiter('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── callBill ──────────────────────────────────────────────────────────────

  describe('callBill', () => {
    it('sets callBill to true and emits event', async () => {
      const order = makeOrderDoc();
      orderModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(order),
      });

      await service.callBill('id');
      expect(order.callBill).toBe(true);
      expect(order.save).toHaveBeenCalled();
      expect(mockGateway.emitOrderUpdated).toHaveBeenCalled();
    });

    it('throws NotFoundException when order not found', async () => {
      orderModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(service.callBill('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getPublicMenu ─────────────────────────────────────────────────────────

  describe('getPublicMenu', () => {
    it('returns local, categories, and items', async () => {
      categoryModel.find.mockReturnValue(buildQuery([{ name: 'Entradas' }]));
      itemModel.find.mockReturnValue(buildQuery([{ name: 'Pizza' }]));

      const result = await service.getPublicMenu(localOid.toString());
      expect(result.local).toBeDefined();
      expect(result.categories).toHaveLength(1);
      expect(result.items).toHaveLength(1);
    });

    it('throws NotFoundException when local not found', async () => {
      localModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(service.getPublicMenu('bad')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when local is inactive', async () => {
      const inactiveLocal = makeLocalDoc({ isActive: false });
      localModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(inactiveLocal),
      });
      await expect(service.getPublicMenu(localOid.toString())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getLocalTables ────────────────────────────────────────────────────────

  describe('getLocalTables', () => {
    it('returns correct number of tables with QR URLs', async () => {
      const tables = await service.getLocalTables(
        localOid.toString(),
        tenantOid.toString(),
        'http://localhost:4200',
      );

      expect(tables).toHaveLength(5);
      expect(tables[0]).toEqual({
        number: 1,
        name: 'Mesa 1',
        qrUrl: `http://localhost:4200/q/${localOid}/1`,
      });
      expect(tables[4].number).toBe(5);
    });

    it('throws NotFoundException when local not found', async () => {
      localModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(
        service.getLocalTables(
          'bad',
          tenantOid.toString(),
          'http://localhost:4200',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong tenant', async () => {
      const local = makeLocalDoc({ tenantId: { toString: () => 'other' } });
      localModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(local),
      });
      await expect(
        service.getLocalTables(
          localOid.toString(),
          tenantOid.toString(),
          'http://localhost:4200',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
