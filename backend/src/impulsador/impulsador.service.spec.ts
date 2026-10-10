import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ImpulsadorService } from './impulsador.service';

// ─── helpers ─────────────────────────────────────────────────────────────────

const tenantOid = new Types.ObjectId();
const tenantId = tenantOid.toString();
const userOid = new Types.ObjectId();
const userId = userOid.toString();
const eventOid = new Types.ObjectId();

function buildQuery(result: unknown) {
  const q: Record<string, jest.Mock> = {};
  for (const m of ['sort', 'lean']) q[m] = jest.fn(() => q);
  q.exec = jest.fn().mockResolvedValue(result);
  return q;
}

function makeRegDoc(overrides: Record<string, unknown> = {}) {
  const doc: any = {
    _id: new Types.ObjectId(),
    tenantId: tenantOid,
    eventId: eventOid,
    name: 'Ana Pérez',
    email: 'ana@correo.pe',
    phone: '+51 999 888 777',
    checkedIn: false,
    checkedInAt: undefined as Date | undefined,
    save: jest.fn(),
    ...overrides,
  };
  doc.save.mockResolvedValue(doc);
  doc.toObject = jest.fn(() => ({
    _id: doc._id,
    eventId: doc.eventId,
    name: doc.name,
    email: doc.email,
  }));
  return doc;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('ImpulsadorService', () => {
  let service: ImpulsadorService;
  let eventModel: { find: jest.Mock; findOne: jest.Mock };
  let regModel: { find: jest.Mock; findById: jest.Mock };
  let settings: { sendWhatsApp: jest.Mock };
  let mail: { sendCampaign: jest.Mock };

  beforeEach(() => {
    eventModel = {
      find: jest.fn().mockReturnValue(buildQuery([])),
      findOne: jest.fn().mockReturnValue(buildQuery(null)),
    };
    regModel = {
      find: jest.fn().mockReturnValue(buildQuery([])),
      findById: jest.fn().mockReturnValue(buildQuery(null)),
    };
    // Ningún mensaje sale de verdad: WhatsApp y correo son dobles.
    settings = { sendWhatsApp: jest.fn().mockResolvedValue(undefined) };
    mail = { sendCampaign: jest.fn().mockResolvedValue(undefined) };
    service = new ImpulsadorService(
      eventModel as never,
      regModel as never,
      settings as never,
      mail as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** Registro existente cuyo evento pertenece al impulsador. */
  function stubOwnedReg(overrides: Record<string, unknown> = {}) {
    const reg = makeRegDoc(overrides);
    regModel.findById.mockReturnValue(buildQuery(reg));
    eventModel.findOne.mockReturnValue(buildQuery({ _id: eventOid }));
    return reg;
  }

  // ─── findMyRegistrations ───────────────────────────────────────────────────

  describe('findMyRegistrations', () => {
    it('busca solo los eventos que creó el impulsador en su empresa', async () => {
      await service.findMyRegistrations(userId, tenantId);

      const filter = eventModel.find.mock.calls[0][0];
      expect(Object.keys(filter).sort()).toEqual(['createdBy', 'tenantId']);
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(filter.createdBy.toString()).toBe(userId);
    });

    it('sin eventos propios no hay asistentes y no consulta registros', async () => {
      await expect(
        service.findMyRegistrations(userId, tenantId),
      ).resolves.toEqual([]);
      expect(regModel.find).not.toHaveBeenCalled();
    });

    it('trae los registros de sus eventos, del más reciente al más antiguo', async () => {
      const otherEvent = new Types.ObjectId();
      eventModel.find.mockReturnValue(
        buildQuery([
          { _id: eventOid, title: 'Cata', date: new Date('2026-04-01') },
          { _id: otherEvent, title: 'Feria', date: new Date('2026-05-01') },
        ]),
      );
      const query = buildQuery([]);
      regModel.find.mockReturnValue(query);

      await service.findMyRegistrations(userId, tenantId);

      const filter = regModel.find.mock.calls[0][0];
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(filter.eventId).toEqual({ $in: [eventOid, otherEvent] });
      expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    it('añade a cada registro el título y la fecha de su evento', async () => {
      const date = new Date('2026-04-01T20:00:00Z');
      eventModel.find.mockReturnValue(
        buildQuery([{ _id: eventOid, title: 'Cata de vinos', date }]),
      );
      const reg = makeRegDoc();
      regModel.find.mockReturnValue(buildQuery([reg]));

      const result = await service.findMyRegistrations(userId, tenantId);

      expect(result).toEqual([
        {
          _id: reg._id,
          eventId: eventOid,
          name: 'Ana Pérez',
          email: 'ana@correo.pe',
          eventTitle: 'Cata de vinos',
          eventDate: date,
        },
      ]);
    });
  });

  // ─── propiedad del registro ────────────────────────────────────────────────

  describe('propiedad del registro', () => {
    it('registro inexistente lanza NotFoundException', async () => {
      await expect(service.checkIn('x', userId, tenantId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('un registro de otra empresa no se toca ni recibe mensajes', async () => {
      const reg = stubOwnedReg({ tenantId: new Types.ObjectId() });

      await expect(service.checkIn('x', userId, tenantId)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        service.sendDirectMessage('x', userId, tenantId, {
          channel: 'whatsapp',
          body: 'Hola',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(reg.save).not.toHaveBeenCalled();
      expect(reg.checkedIn).toBe(false);
      expect(settings.sendWhatsApp).not.toHaveBeenCalled();
    });

    it('comprueba que el evento del registro lo creó el impulsador', async () => {
      const reg = stubOwnedReg();

      await service.checkIn(reg._id.toString(), userId, tenantId);

      const filter = eventModel.findOne.mock.calls[0][0];
      expect(filter._id).toBe(eventOid);
      expect(filter.createdBy.toString()).toBe(userId);
    });

    it('el asistente de un evento de otro impulsador no se toca ni recibe mensajes', async () => {
      const reg = makeRegDoc();
      regModel.findById.mockReturnValue(buildQuery(reg));
      eventModel.findOne.mockReturnValue(buildQuery(null));

      await expect(service.checkIn('x', userId, tenantId)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        service.sendDirectMessage('x', userId, tenantId, {
          channel: 'email',
          body: 'Hola',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(reg.save).not.toHaveBeenCalled();
      expect(mail.sendCampaign).not.toHaveBeenCalled();
    });
  });

  // ─── sendDirectMessage ─────────────────────────────────────────────────────

  describe('sendDirectMessage', () => {
    it('WhatsApp: envía al teléfono del asistente con la configuración de la empresa', async () => {
      const reg = stubOwnedReg();

      const result = await service.sendDirectMessage(
        reg._id.toString(),
        userId,
        tenantId,
        {
          channel: 'whatsapp',
          body: 'Te esperamos',
          mediaUrl: 'https://cdn.test/a.jpg',
          mediaType: 'image',
        },
      );

      expect(settings.sendWhatsApp).toHaveBeenCalledWith(
        '+51 999 888 777',
        'Te esperamos',
        tenantId,
        'https://cdn.test/a.jpg',
        'image',
      );
      expect(mail.sendCampaign).not.toHaveBeenCalled();
      expect(result).toEqual({ sent: true });
    });

    it('WhatsApp: sin teléfono registrado lanza BadRequestException y no envía', async () => {
      stubOwnedReg({ phone: undefined });

      await expect(
        service.sendDirectMessage('x', userId, tenantId, {
          channel: 'whatsapp',
          body: 'Hola',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(settings.sendWhatsApp).not.toHaveBeenCalled();
      // Tampoco cae al correo por su cuenta.
      expect(mail.sendCampaign).not.toHaveBeenCalled();
    });

    it('email: envía al correo del asistente con el asunto indicado', async () => {
      stubOwnedReg();

      await service.sendDirectMessage('x', userId, tenantId, {
        channel: 'email',
        subject: 'Recordatorio',
        body: 'Te esperamos',
      });

      expect(mail.sendCampaign).toHaveBeenCalledWith({
        to: 'ana@correo.pe',
        name: 'Ana Pérez',
        subject: 'Recordatorio',
        body: 'Te esperamos',
        mediaUrl: undefined,
        mediaType: undefined,
      });
      expect(settings.sendWhatsApp).not.toHaveBeenCalled();
    });

    it('email: sin asunto usa uno por defecto', async () => {
      stubOwnedReg();

      await service.sendDirectMessage('x', userId, tenantId, {
        channel: 'email',
        body: 'Te esperamos',
      });

      expect(mail.sendCampaign.mock.calls[0][0].subject).toBe(
        'Mensaje de tu promotor',
      );
    });

    it('si el proveedor falla, el error se propaga y no se informa como enviado', async () => {
      stubOwnedReg();
      settings.sendWhatsApp.mockRejectedValue(new Error('WAHA caído'));

      await expect(
        service.sendDirectMessage('x', userId, tenantId, {
          channel: 'whatsapp',
          body: 'Hola',
        }),
      ).rejects.toThrow('WAHA caído');
    });
  });

  // ─── checkIn ────────────────────────────────────────────────────────────────

  describe('checkIn', () => {
    it('marca la asistencia con la hora actual y guarda', async () => {
      jest.useFakeTimers();
      const now = new Date('2026-04-01T20:15:00Z');
      jest.setSystemTime(now);
      const reg = stubOwnedReg();

      const result = await service.checkIn(
        reg._id.toString(),
        userId,
        tenantId,
      );

      expect(reg.checkedIn).toBe(true);
      expect(reg.checkedInAt).toEqual(now);
      expect(reg.save).toHaveBeenCalledTimes(1);
      expect(result).toBe(reg);
    });
  });
});
