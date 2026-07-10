import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import { Event } from './event.schema';
import { EventRegistration } from './event-registration.schema';
import { ExternalImpulsador } from './external-impulsador.schema';
import { User } from '../users/user.schema';
import { RegisterEventDto } from './dto/event.dto';
import { MailService, EmailDesign } from '../mail/mail.service';
import { ImpulsadoresService } from './impulsadores.service';

// Registro público, listado/búsqueda de registrations y check-in.
@Injectable()
export class RegistrationsService {
  constructor(
    @InjectModel(Event.name) private eventModel: Model<Event>,
    @InjectModel(EventRegistration.name)
    private regModel: Model<EventRegistration>,
    @InjectModel(ExternalImpulsador.name)
    private extImpulsadorModel: Model<ExternalImpulsador>,
    @InjectModel(User.name) private userModel: Model<User>,
    private impulsadores: ImpulsadoresService,
    private mail: MailService,
  ) {}

  async registerForEvent(
    eventId: string,
    dto: RegisterEventDto,
  ): Promise<EventRegistration> {
    const event = await this.eventModel.findById(eventId).exec();
    if (!event) throw new NotFoundException('Evento no encontrado');
    if (event.status !== 'published')
      throw new BadRequestException('Evento no disponible');

    const partySize = dto.partySize ?? 1;
    if (event.capacity > 0) {
      const used = await this.regModel.countDocuments({
        eventId: new Types.ObjectId(eventId),
        status: 'confirmed',
      });
      if (used + partySize > event.capacity)
        throw new BadRequestException('Sin cupos disponibles');
    }

    let impulsadorId: Types.ObjectId | undefined;
    let impulsadorCode: string | undefined;
    if (dto.ref) {
      const attribution = await this.impulsadores.resolveAttribution(
        dto.ref,
        event.tenantId,
      );
      impulsadorId = attribution.impulsadorId;
      impulsadorCode = attribution.impulsadorCode;
    }

    const ticketCode = randomUUID().toUpperCase().replace(/-/g, '').slice(0, 8);
    const reg = new this.regModel({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      partySize,
      eventId: new Types.ObjectId(eventId),
      tenantId: event.tenantId,
      ticketCode,
      customFields: dto.customFields ?? {},
      ...(impulsadorCode
        ? { impulsadorCode, ...(impulsadorId ? { impulsadorId } : {}) }
        : {}),
    });

    const saved = await reg.save();

    const emailDesign = event.invitationDesign?.['emailDesign'] as
      | EmailDesign
      | undefined;

    void this.mail.sendEventConfirmationEmail({
      email: saved.email,
      name: saved.name,
      eventTitle: event.title,
      eventDate: event.date.toISOString().split('T')[0],
      eventTime: event.startTime,
      ticketCode: saved.ticketCode,
      partySize: saved.partySize,
      design: emailDesign ?? null,
    });

    return saved;
  }

  async findRegistrations(
    eventId: string,
    tenantId: string,
    filters?: {
      search?: string;
      status?: string;
      sortBy?: string;
      sortOrder?: string;
    },
  ): Promise<(EventRegistration & { impulsadorName?: string | null })[]> {
    const event = await this.eventModel.findById(eventId).exec();
    if (!event) throw new NotFoundException('Evento no encontrado');
    if (event.tenantId.toString() !== tenantId) throw new ForbiddenException();

    const query: Record<string, unknown> = {
      eventId: new Types.ObjectId(eventId),
    };

    if (filters?.status && filters.status !== 'all') {
      query.status = filters.status;
    }

    if (filters?.search?.trim()) {
      const re = new RegExp(filters.search.trim(), 'i');
      query.$or = [
        { name: re },
        { email: re },
        { ticketCode: re },
        { phone: re },
      ];
    }

    const validSortFields = ['name', 'email', 'createdAt', 'partySize'];
    const sortField = validSortFields.includes(filters?.sortBy ?? '')
      ? filters!.sortBy!
      : 'createdAt';
    const sortDir: 1 | -1 = filters?.sortOrder === 'asc' ? 1 : -1;

    const regs = await this.regModel
      .find(query)
      .sort({ [sortField]: sortDir })
      .exec();

    return this.withImpulsadorNames(regs);
  }

  private async withImpulsadorNames(
    regs: EventRegistration[],
  ): Promise<(EventRegistration & { impulsadorName?: string | null })[]> {
    const codes = [
      ...new Set(
        regs.filter((r) => r.impulsadorCode).map((r) => r.impulsadorCode!),
      ),
    ];
    if (codes.length === 0) {
      return regs.map((r) =>
        Object.assign(r.toObject(), { impulsadorName: null }),
      );
    }
    const [users, externals] = await Promise.all([
      this.userModel
        .find(
          { referralCode: { $in: codes } },
          { name: 1, email: 1, referralCode: 1 },
        )
        .lean()
        .exec(),
      this.extImpulsadorModel
        .find({ code: { $in: codes } }, { name: 1, code: 1 })
        .lean()
        .exec(),
    ]);
    const nameMap = new Map<string, string>();
    for (const u of users)
      if (u.referralCode) nameMap.set(u.referralCode, u.name || u.email);
    for (const e of externals) nameMap.set(e.code, e.name);
    return regs.map((r) =>
      Object.assign(r.toObject(), {
        impulsadorName: r.impulsadorCode
          ? (nameMap.get(r.impulsadorCode) ?? null)
          : null,
      }),
    );
  }

  async checkInByCode(
    eventId: string,
    tenantId: string,
    code: string,
  ): Promise<
    EventRegistration & {
      impulsadorName?: string | null;
      alreadyCheckedIn: boolean;
    }
  > {
    const event = await this.eventModel.findById(eventId).exec();
    if (!event) throw new NotFoundException('Evento no encontrado');
    if (event.tenantId.toString() !== tenantId) throw new ForbiddenException();

    const reg = await this.regModel
      .findOne({
        eventId: new Types.ObjectId(eventId),
        ticketCode: code.trim().toUpperCase(),
      })
      .exec();
    if (!reg) throw new NotFoundException('Código de invitación no encontrado');

    const alreadyCheckedIn = reg.checkedIn;
    if (!alreadyCheckedIn) {
      reg.checkedIn = true;
      reg.checkedInAt = new Date();
      await reg.save();
    }

    const [withName] = await this.withImpulsadorNames([reg]);
    return Object.assign(withName, { alreadyCheckedIn });
  }

  async findMyRegistrations(
    impulsadorId: string,
    tenantId: string,
  ): Promise<
    (EventRegistration & { eventTitle?: string; eventDate?: Date })[]
  > {
    const regs = await this.regModel
      .find({
        impulsadorId: new Types.ObjectId(impulsadorId),
        tenantId: new Types.ObjectId(tenantId),
      })
      .sort({ createdAt: -1 })
      .exec();

    const eventIds = [...new Set(regs.map((r) => r.eventId.toString()))];
    const events = await this.eventModel
      .find({ _id: { $in: eventIds } })
      .lean()
      .exec();
    const eventMap = new Map(events.map((e) => [e._id.toString(), e]));

    return regs.map((reg) => {
      const ev = eventMap.get(reg.eventId.toString());
      return Object.assign(reg.toObject(), {
        eventTitle: ev?.title,
        eventDate: ev?.date,
      });
    });
  }

  async checkIn(
    eventId: string,
    regId: string,
    tenantId: string,
  ): Promise<EventRegistration> {
    const event = await this.eventModel.findById(eventId).exec();
    if (!event) throw new NotFoundException('Evento no encontrado');
    if (event.tenantId.toString() !== tenantId) throw new ForbiddenException();

    const reg = await this.regModel.findById(regId).exec();
    if (!reg) throw new NotFoundException('Registro no encontrado');
    if (reg.eventId.toString() !== eventId)
      throw new BadRequestException('El registro no pertenece a este evento');

    reg.checkedIn = true;
    reg.checkedInAt = new Date();
    return reg.save();
  }
}
