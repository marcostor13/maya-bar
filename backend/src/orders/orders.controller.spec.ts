import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

const mockOrdersService = {
  getPublicMenu: jest.fn(),
  createOrder: jest.fn(),
  findOrderById: jest.fn(),
  callWaiter: jest.fn(),
  callBill: jest.fn(),
  findOrders: jest.fn(),
  getLocalTables: jest.fn(),
  updateStatus: jest.fn(),
  modifyOrder: jest.fn(),
  cancelOrder: jest.fn(),
};

const mockReq = { user: { tenantId: 'tenant-1', role: 'TENANT_ADMIN' } };

describe('OrdersController', () => {
  let controller: OrdersController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: mockOrdersService }],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
  });

  // ─── Public endpoints ──────────────────────────────────────────────────────

  describe('getPublicMenu', () => {
    it('calls service with localId', async () => {
      mockOrdersService.getPublicMenu.mockResolvedValue({
        local: {},
        categories: [],
        items: [],
      });
      await controller.getPublicMenu('local-1');
      expect(mockOrdersService.getPublicMenu).toHaveBeenCalledWith('local-1');
    });
  });

  describe('createOrder', () => {
    it('calls service with dto', async () => {
      const dto = { localId: 'l1', tableNumber: '3', items: [] };
      mockOrdersService.createOrder.mockResolvedValue({ _id: 'order-1' });
      await controller.createOrder(dto);
      expect(mockOrdersService.createOrder).toHaveBeenCalledWith(dto);
    });
  });

  describe('trackOrder', () => {
    it('calls service with id', async () => {
      mockOrdersService.findOrderById.mockResolvedValue({ _id: 'order-1' });
      await controller.trackOrder('order-1');
      expect(mockOrdersService.findOrderById).toHaveBeenCalledWith('order-1');
    });
  });

  describe('callWaiter', () => {
    it('calls service with orderId', async () => {
      mockOrdersService.callWaiter.mockResolvedValue({});
      await controller.callWaiter('order-1');
      expect(mockOrdersService.callWaiter).toHaveBeenCalledWith('order-1');
    });
  });

  describe('callBill', () => {
    it('calls service with orderId', async () => {
      mockOrdersService.callBill.mockResolvedValue({});
      await controller.callBill('order-1');
      expect(mockOrdersService.callBill).toHaveBeenCalledWith('order-1');
    });
  });

  // ─── Staff endpoints ───────────────────────────────────────────────────────

  describe('findOrders', () => {
    it('calls service with tenantId, localId, and status', async () => {
      mockOrdersService.findOrders.mockResolvedValue([]);
      await controller.findOrders('local-1', 'pending', mockReq as any);
      expect(mockOrdersService.findOrders).toHaveBeenCalledWith(
        'tenant-1',
        'local-1',
        'pending',
      );
    });
  });

  describe('getLocalTables', () => {
    it('calls service with localId, tenantId, and base URL from origin header', async () => {
      mockOrdersService.getLocalTables.mockResolvedValue([]);
      await controller.getLocalTables(
        'local-1',
        mockReq as any,
        'http://app.test',
      );
      expect(mockOrdersService.getLocalTables).toHaveBeenCalledWith(
        'local-1',
        'tenant-1',
        'http://app.test',
      );
    });

    it('falls back to localhost when origin header is missing', async () => {
      mockOrdersService.getLocalTables.mockResolvedValue([]);
      await controller.getLocalTables(
        'local-1',
        mockReq as any,
        undefined as any,
      );
      expect(mockOrdersService.getLocalTables).toHaveBeenCalledWith(
        'local-1',
        'tenant-1',
        'http://localhost:4200',
      );
    });
  });

  describe('updateStatus', () => {
    it('calls service with id, tenantId, and status', async () => {
      mockOrdersService.updateStatus.mockResolvedValue({});
      await controller.updateStatus(
        'order-1',
        { status: 'preparing' },
        mockReq as any,
      );
      expect(mockOrdersService.updateStatus).toHaveBeenCalledWith(
        'order-1',
        'tenant-1',
        'preparing',
      );
    });
  });

  describe('modifyOrder', () => {
    it('calls service with id, tenantId, items, and notes', async () => {
      mockOrdersService.modifyOrder.mockResolvedValue({});
      const items = [
        {
          itemId: 'i1',
          name: 'Lomo',
          price: 30,
          quantity: 1,
          stations: ['kitchen'],
          subtotal: 30,
        },
      ];
      await controller.modifyOrder(
        'order-1',
        { items, notes: 'sin sal' },
        mockReq as any,
      );
      expect(mockOrdersService.modifyOrder).toHaveBeenCalledWith(
        'order-1',
        'tenant-1',
        items,
        'sin sal',
      );
    });
  });

  describe('cancelOrder', () => {
    it('calls service with id and tenantId', async () => {
      mockOrdersService.cancelOrder.mockResolvedValue({});
      await controller.cancelOrder('order-1', mockReq as any);
      expect(mockOrdersService.cancelOrder).toHaveBeenCalledWith(
        'order-1',
        'tenant-1',
      );
    });
  });
});
