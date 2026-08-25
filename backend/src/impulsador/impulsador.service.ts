import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Event } from '../events/event.schema';
import { EventRegistration } from '../events/event-registration.schema';
import { SettingsService } from '../settings/settings.service';
import { MailService } from '../mail/mail.service';
import { DirectMessageDto } from './dto/direct-message.dto';

export type RegWithEvent = EventRegistration & {
  eventTitle?: string;
  eventDate?: Date;
};

@Injectable()
export class ImpulsadorService {
  constructor(
    @InjectModel(Event.name) private eventModel: Model<Event>,
    @InjectModel(EventRegistration.name)
    private regModel: Model<EventRegistration>,
    private settings: SettingsService,
    private mail: MailService,
  ) {}

  async findMyRegistrations(
    impulsadorId: string,
    tenantId: string,
  ): Promise<RegWithEvent[]> {
    const tid = new Types.ObjectId(tenantId);
    const uid = new Types.ObjectId(impulsadorId);

    // All events created by this impulsador
    const events = await this.eventModel
      .find({ tenantId: tid, createdBy: uid })
      .lean()
      .exec();
    const eventMap = new Map(events.map((e) => [e._id.toString(), e]));
    const eventIds = events.map((e) => e._id);

    if (eventIds.length === 0) return [];

    const regs = await this.regModel
      .find({ eventId: { $in: eventIds }, tenantId: tid })
      .sort({ createdAt: -1 })
      .exec();

    return regs.map((reg) => {
      const ev = eventMap.get(reg.eventId.toString());
      return Object.assign(reg.toObject(), {
        eventTitle: ev?.title,
        eventDate: ev?.date,
      });
    });
  }

  private async assertRegOwnership(
    regId: string,
    impulsadorId: string,
    tenantId: string,
  ): Promise<EventRegistration> {
    const reg = await this.regModel.findById(regId).exec();
    if (!reg) throw new NotFoundException('Registro no encontrado');
    if (reg.tenantId.toString() !== tenantId) throw new ForbiddenException();
    // Verify the event belongs to this impulsador
    const event = await this.eventModel
      .findOne({
        _id: reg.eventId,
        createdBy: new Types.ObjectId(impulsadorId),
      })
      .lean()
      .exec();
    if (!event) throw new ForbiddenException();
    return reg;
  }

  async sendDirectMessage(
    regId: string,
    impulsadorId: string,
    tenantId: string,
    dto: DirectMessageDto,
  ): Promise<{ sent: boolean }> {
    const reg = await this.assertRegOwnership(regId, impulsadorId, tenantId);

    if (dto.channel === 'whatsapp') {
      if (!reg.phone)
        throw new BadRequestException(
          'El asistente no tiene teléfono registrado',
        );
      await this.settings.sendWhatsApp(
        reg.phone,
        dto.body,
        tenantId,
        dto.mediaUrl,
        dto.mediaType,
      );
    } else {
      await this.mail.sendCampaign({
        to: reg.email,
        name: reg.name,
        subject: dto.subject ?? 'Mensaje de tu promotor',
        body: dto.body,
        mediaUrl: dto.mediaUrl,
        mediaType: dto.mediaType,
      });
    }

    return { sent: true };
  }

  async checkIn(
    regId: string,
    impulsadorId: string,
    tenantId: string,
  ): Promise<EventRegistration> {
    const reg = await this.assertRegOwnership(regId, impulsadorId, tenantId);
    reg.checkedIn = true;
    reg.checkedInAt = new Date();
    return reg.save();
  }
}
