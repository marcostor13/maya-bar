import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { Reservation, ReservationStatus } from './reservation.schema';
import { Local, ReservationConfig } from '../locals/local.schema';
import {
  CreateReservationDto,
  ReservationConfigDto,
} from './dto/reservation.dto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectModel(Reservation.name) private reservationModel: Model<Reservation>,
    @InjectModel(Local.name) private localModel: Model<Local>,
    private mailService: MailService,
  ) {}

  // ─── Public ───────────────────────────────────────────────────────────────

  async getAvailability(
    localId: string,
    date: string,
  ): Promise<{ turno: string; available: boolean; spotsLeft: number }[]> {
    const local = await this.localModel.findById(localId).exec();
    if (!local || !local.isActive)
      throw new NotFoundException('Local no encontrado');

    const cfg = local.reservationConfig;
    if (!cfg?.enabled || !cfg.turnos?.length) return [];

    const reservations = await this.reservationModel
      .find({
        localId: new Types.ObjectId(localId),
        date,
        status: { $in: ['pending', 'confirmed'] },
      })
      .exec();

    return cfg.turnos.map((turno) => {
      const count = reservations.filter((r) => r.turno === turno).length;
      return {
        turno,
        available: count < cfg.maxPerTurno,
        spotsLeft: Math.max(0, cfg.maxPerTurno - count),
      };
    });
  }

  async getPublicConfig(localId: string): Promise<{
    localName: string;
    config: ReservationConfig;
  }> {
    const local = await this.localModel.findById(localId).exec();
    if (!local || !local.isActive)
      throw new NotFoundException('Local no encontrado');
    return { localName: local.name, config: local.reservationConfig };
  }

  async createReservation(dto: CreateReservationDto): Promise<Reservation> {
    const local = await this.localModel.findById(dto.localId).exec();
    if (!local || !local.isActive)
      throw new NotFoundException('Local no encontrado');

    const cfg = local.reservationConfig;
    if (!cfg?.enabled)
      throw new BadRequestException('Reservas no disponibles en este local');

    if (dto.partySize > cfg.maxPartySize) {
      throw new BadRequestException(
        `Máximo ${cfg.maxPartySize} personas por reserva`,
      );
    }

    if (!cfg.turnos.includes(dto.turno)) {
      throw new BadRequestException('Turno no disponible');
    }

    const count = await this.reservationModel.countDocuments({
      localId: new Types.ObjectId(dto.localId),
      date: dto.date,
      turno: dto.turno,
      status: { $in: ['pending', 'confirmed'] },
    });

    if (count >= cfg.maxPerTurno) {
      throw new BadRequestException('Turno completo, elige otro horario');
    }

    const token = randomBytes(16).toString('hex');
    const reservation = new this.reservationModel({
      tenantId: local.tenantId,
      localId: new Types.ObjectId(dto.localId),
      date: dto.date,
      turno: dto.turno,
      partySize: dto.partySize,
      guestName: dto.guestName,
      guestEmail: dto.guestEmail,
      guestPhone: dto.guestPhone,
      occasion: dto.occasion,
      notes: dto.notes,
      status: 'pending',
      confirmationToken: token,
      statusHistory: [{ status: 'pending', at: new Date() }],
    });

    const saved = await reservation.save();

    // Enviar correo de confirmación
    void this.mailService.sendReservationEmail({
      email: saved.guestEmail,
      guestName: saved.guestName,
      localName: local.name,
      date: saved.date,
      turno: saved.turno,
      partySize: saved.partySize,
      token: saved.confirmationToken,
    });

    return saved;
  }

  async getByToken(
    token: string,
  ): Promise<Reservation & { localName: string }> {
    const reservation = await this.reservationModel
      .findOne({ confirmationToken: token })
      .exec();
    if (!reservation) throw new NotFoundException('Reserva no encontrada');
    const local = await this.localModel.findById(reservation.localId).exec();
    return Object.assign(reservation.toObject(), {
      localName: local?.name ?? '',
    });
  }

  async confirmByToken(token: string): Promise<Reservation> {
    const reservation = await this.reservationModel
      .findOne({ confirmationToken: token })
      .exec();
    if (!reservation) throw new NotFoundException('Reserva no encontrada');
    if (reservation.status === 'cancelled') {
      throw new BadRequestException('Reserva cancelada, no se puede confirmar');
    }
    if (reservation.status === 'confirmed') return reservation;

    reservation.status = 'confirmed';
    reservation.statusHistory.push({ status: 'confirmed', at: new Date() });
    return reservation.save();
  }

  // ─── Staff ────────────────────────────────────────────────────────────────

  async findReservations(
    tenantId: string,
    localId: string,
    date?: string,
    status?: string,
  ): Promise<Reservation[]> {
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      localId: new Types.ObjectId(localId),
    };
    if (date) filter.date = date;
    if (status) filter.status = status;
    return this.reservationModel
      .find(filter)
      .sort({ date: 1, turno: 1 })
      .exec();
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: ReservationStatus,
    note?: string,
  ): Promise<Reservation> {
    const reservation = await this.reservationModel.findById(id).exec();
    if (!reservation) throw new NotFoundException('Reserva no encontrada');
    if (reservation.tenantId.toString() !== tenantId)
      throw new ForbiddenException();

    reservation.status = status;
    reservation.statusHistory.push({ status, at: new Date(), note });
    return reservation.save();
  }

  async getConfig(
    localId: string,
    tenantId: string,
  ): Promise<ReservationConfig> {
    const local = await this.localModel.findById(localId).exec();
    if (!local) throw new NotFoundException('Local no encontrado');
    if (local.tenantId.toString() !== tenantId) throw new ForbiddenException();
    return local.reservationConfig;
  }

  async updateConfig(
    tenantId: string,
    dto: ReservationConfigDto,
  ): Promise<ReservationConfig> {
    const local = await this.localModel.findById(dto.localId).exec();
    if (!local) throw new NotFoundException('Local no encontrado');
    if (local.tenantId.toString() !== tenantId) throw new ForbiddenException();

    local.reservationConfig = {
      enabled: dto.enabled,
      turnos: dto.turnos,
      defaultDuration: dto.defaultDuration,
      maxPerTurno: dto.maxPerTurno,
      maxPartySize: dto.maxPartySize,
      advanceBookingDays: dto.advanceBookingDays,
    };
    await local.save();
    return local.reservationConfig;
  }
}
