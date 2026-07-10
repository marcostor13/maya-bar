import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { Event } from './event.schema';
import { ExternalImpulsador } from './external-impulsador.schema';
import { User } from '../users/user.schema';
import { CreateExternalImpulsadorDto } from './dto/event.dto';

// Impulsadores asignados/externos y atribución por referralCode.
@Injectable()
export class ImpulsadoresService {
  constructor(
    @InjectModel(Event.name) private eventModel: Model<Event>,
    @InjectModel(ExternalImpulsador.name)
    private extImpulsadorModel: Model<ExternalImpulsador>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  async findImpulsadores(
    eventId: string,
    tenantId: string,
  ): Promise<
    {
      _id: string;
      name: string;
      email: string;
      referralCode?: string;
      assigned: boolean;
      type: 'user' | 'external';
    }[]
  > {
    const event = await this.eventModel.findById(eventId).exec();
    if (!event) throw new NotFoundException('Evento no encontrado');
    if (event.tenantId.toString() !== tenantId) throw new ForbiddenException();

    const [impulsadores, externals] = await Promise.all([
      this.userModel
        .find(
          { tenantId: event.tenantId, role: 'IMPULSADOR', isActive: true },
          { name: 1, email: 1, referralCode: 1 },
        )
        .sort({ name: 1 })
        .lean()
        .exec(),
      this.extImpulsadorModel
        .find(
          { tenantId: event.tenantId, active: true },
          { name: 1, email: 1, code: 1 },
        )
        .sort({ name: 1 })
        .lean()
        .exec(),
    ]);

    const sharedWith = new Set(
      (event.sharedWith ?? []).map((id) => id.toString()),
    );

    const userList = impulsadores.map((u) => ({
      _id: u._id.toString(),
      name: u.name || u.email,
      email: u.email,
      referralCode: u.referralCode,
      assigned: event.sharedWithAll || sharedWith.has(u._id.toString()),
      type: 'user' as const,
    }));

    const externalList = externals.map((e) => ({
      _id: e._id.toString(),
      name: e.name,
      email: e.email ?? '',
      referralCode: e.code,
      assigned: true,
      type: 'external' as const,
    }));

    return [...userList, ...externalList];
  }

  async createExternalImpulsador(
    tenantId: string,
    userId: string,
    dto: CreateExternalImpulsadorDto,
  ): Promise<ExternalImpulsador> {
    if (!dto.name?.trim())
      throw new BadRequestException('El nombre es requerido');
    const code = randomBytes(4).toString('hex').toUpperCase();
    const external = new this.extImpulsadorModel({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name.trim(),
      phone: dto.phone,
      email: dto.email,
      code,
      createdBy: new Types.ObjectId(userId),
    });
    return external.save();
  }

  async deactivateExternalImpulsador(
    id: string,
    tenantId: string,
  ): Promise<void> {
    const external = await this.extImpulsadorModel.findById(id).exec();
    if (!external) throw new NotFoundException('Impulsador no encontrado');
    if (external.tenantId.toString() !== tenantId)
      throw new ForbiddenException();
    external.active = false;
    await external.save();
  }

  // Resuelve la atribución de un registro a un impulsador por referralCode
  // (usuario IMPULSADOR activo) o código de impulsador externo activo.
  async resolveAttribution(
    ref: string,
    tenantId: Types.ObjectId,
  ): Promise<{
    impulsadorId?: Types.ObjectId;
    impulsadorCode?: string;
  }> {
    const impulsador = await this.userModel
      .findOne({
        referralCode: ref,
        tenantId,
        role: 'IMPULSADOR',
        isActive: true,
      })
      .exec();
    if (impulsador) {
      return { impulsadorId: impulsador._id, impulsadorCode: ref };
    }
    const external = await this.extImpulsadorModel
      .findOne({ code: ref, tenantId, active: true })
      .exec();
    if (external) return { impulsadorCode: ref };
    return {};
  }
}
