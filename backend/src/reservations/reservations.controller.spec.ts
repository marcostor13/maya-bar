import { Test, TestingModule } from '@nestjs/testing';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

const mockService = {
  getAvailability: jest.fn(),
  getPublicConfig: jest.fn(),
  createReservation: jest.fn(),
  getByToken: jest.fn(),
  confirmByToken: jest.fn(),
  findReservations: jest.fn(),
  updateStatus: jest.fn(),
  getConfig: jest.fn(),
  updateConfig: jest.fn(),
};

const mockReq = { user: { tenantId: 'tenant-1', role: 'TENANT_ADMIN' } };

describe('ReservationsController', () => {
  let controller: ReservationsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReservationsController],
      providers: [{ provide: ReservationsService, useValue: mockService }],
    }).compile();

    controller = module.get<ReservationsController>(ReservationsController);
  });

  // ─── Public endpoints ─────────────────────────────────────────────────────

  describe('getAvailability', () => {
    it('calls service with localId and date', async () => {
      mockService.getAvailability.mockResolvedValue([]);
      await controller.getAvailability('local-1', '2026-06-15');
      expect(mockService.getAvailability).toHaveBeenCalledWith(
        'local-1',
        '2026-06-15',
      );
    });
  });

  describe('getPublicConfig', () => {
    it('calls service with localId', async () => {
      mockService.getPublicConfig.mockResolvedValue({
        localName: 'Test',
        config: {},
      });
      await controller.getPublicConfig('local-1');
      expect(mockService.getPublicConfig).toHaveBeenCalledWith('local-1');
    });
  });

  describe('createReservation', () => {
    it('calls service with dto', async () => {
      const dto = {
        localId: 'local-1',
        date: '2026-06-15',
        turno: '20:00',
        partySize: 2,
        guestName: 'Ana',
        guestEmail: 'ana@test.com',
      };
      mockService.createReservation.mockResolvedValue({ _id: 'res-1' });
      await controller.createReservation(dto);
      expect(mockService.createReservation).toHaveBeenCalledWith(dto);
    });
  });

  describe('getByToken', () => {
    it('calls service with token', async () => {
      mockService.getByToken.mockResolvedValue({ _id: 'res-1' });
      await controller.getByToken('abc123');
      expect(mockService.getByToken).toHaveBeenCalledWith('abc123');
    });
  });

  describe('confirmByToken', () => {
    it('calls service with token', async () => {
      mockService.confirmByToken.mockResolvedValue({ status: 'confirmed' });
      await controller.confirmByToken('abc123');
      expect(mockService.confirmByToken).toHaveBeenCalledWith('abc123');
    });
  });

  // ─── Staff endpoints ──────────────────────────────────────────────────────

  describe('findReservations', () => {
    it('calls service with tenantId, localId, date, and status', async () => {
      mockService.findReservations.mockResolvedValue([]);
      await controller.findReservations(
        'local-1',
        '2026-06-15',
        'confirmed',
        mockReq as any,
      );
      expect(mockService.findReservations).toHaveBeenCalledWith(
        'tenant-1',
        'local-1',
        '2026-06-15',
        'confirmed',
      );
    });
  });

  describe('updateStatus', () => {
    it('calls service with id, tenantId, status, and note', async () => {
      mockService.updateStatus.mockResolvedValue({ status: 'confirmed' });
      await controller.updateStatus(
        'res-1',
        { status: 'confirmed', note: 'ok' },
        mockReq as any,
      );
      expect(mockService.updateStatus).toHaveBeenCalledWith(
        'res-1',
        'tenant-1',
        'confirmed',
        'ok',
      );
    });
  });

  describe('getConfig', () => {
    it('calls service with localId and tenantId', async () => {
      mockService.getConfig.mockResolvedValue({});
      await controller.getConfig('local-1', mockReq as any);
      expect(mockService.getConfig).toHaveBeenCalledWith('local-1', 'tenant-1');
    });
  });

  describe('updateConfig', () => {
    it('calls service with tenantId and dto', async () => {
      const dto = {
        localId: 'local-1',
        enabled: true,
        turnos: ['20:00'],
        defaultDuration: 90,
        maxPerTurno: 4,
        maxPartySize: 10,
        advanceBookingDays: 30,
      };
      mockService.updateConfig.mockResolvedValue(dto);
      await controller.updateConfig(dto, mockReq as any);
      expect(mockService.updateConfig).toHaveBeenCalledWith('tenant-1', dto);
    });
  });
});
