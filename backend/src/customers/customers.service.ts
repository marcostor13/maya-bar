import {
  Injectable,
  Logger,
  OnModuleInit,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer } from './customer.schema';
import { Reservation } from '../reservations/reservation.schema';
import { EventRegistration } from '../events/event-registration.schema';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { isOwnerScoped } from '../auth/permissions';

@Injectable()
export class CustomersService implements OnModuleInit {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
    @InjectModel(Reservation.name) private reservationModel: Model<Reservation>,
    @InjectModel(EventRegistration.name)
    private eventRegModel: Model<EventRegistration>,
  ) {}

  /**
   * El índice único de email pasó a ser parcial para admitir contactos sin
   * email (importados solo con teléfono). Mongo no reemplaza un índice con el
   * mismo patrón de claves y distintas opciones, así que hay que soltar el
   * viejo antes de sincronizar.
   */
  async onModuleInit() {
    try {
      const existing = await this.customerModel.collection.indexes();
      for (const index of existing) {
        const isEmailKey =
          JSON.stringify(index.key) ===
          JSON.stringify({ email: 1, tenantId: 1, createdBy: 1 });
        if (isEmailKey && !index.partialFilterExpression) {
          await this.customerModel.collection.dropIndex(index.name!);
          this.logger.log(`Índice ${index.name} reemplazado por uno parcial`);
        }
      }
      await this.customerModel.syncIndexes();
    } catch (err) {
      // Duplicados previos de teléfono impiden crear el índice único; no es
      // motivo para tumbar el arranque, pero hay que verlo en los logs.
      this.logger.warn(
        `No se pudieron sincronizar los índices de contactos: ${String(err)}`,
      );
    }
  }

  async findAll(
    tenantId: string,
    userId: string,
    role: string,
    search?: string,
    tag?: string,
  ): Promise<Customer[]> {
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
    };
    if (isOwnerScoped(role)) filter['createdBy'] = new Types.ObjectId(userId);
    if (tag) filter['tags'] = tag;
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter['$or'] = [{ name: re }, { email: re }, { phone: re }];
    }
    return this.customerModel.find(filter).sort({ name: 1 }).exec();
  }

  async create(
    tenantId: string,
    userId: string,
    role: string,
    dto: CreateCustomerDto,
  ): Promise<Customer> {
    try {
      const customer = new this.customerModel({
        ...dto,
        email: dto.email?.toLowerCase().trim(),
        tenantId: new Types.ObjectId(tenantId),
        tags: dto.tags ?? [],
        source: 'manual',
        ...(isOwnerScoped(role)
          ? { createdBy: new Types.ObjectId(userId) }
          : {}),
      });
      return await customer.save();
    } catch (err: unknown) {
      const mongoErr = err as { code?: number };
      if (mongoErr.code === 11000)
        throw new ConflictException(
          'Ya existe un contacto con ese email o teléfono',
        );
      throw err;
    }
  }

  async update(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
    dto: UpdateCustomerDto,
  ): Promise<Customer> {
    const customer = await this.customerModel.findById(id).exec();
    if (!customer) throw new NotFoundException('Contacto no encontrado');
    if (customer.tenantId.toString() !== tenantId)
      throw new ForbiddenException();
    if (isOwnerScoped(role) && customer.createdBy?.toString() !== userId)
      throw new ForbiddenException();
    Object.assign(customer, {
      ...dto,
      ...(dto.email ? { email: dto.email.toLowerCase().trim() } : {}),
    });
    return customer.save();
  }

  async delete(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<void> {
    const customer = await this.customerModel.findById(id).exec();
    if (!customer) throw new NotFoundException('Contacto no encontrado');
    if (customer.tenantId.toString() !== tenantId)
      throw new ForbiddenException();
    if (isOwnerScoped(role) && customer.createdBy?.toString() !== userId)
      throw new ForbiddenException();
    await this.customerModel.findByIdAndDelete(id).exec();
  }

  async sync(tenantId: string): Promise<{ imported: number; updated: number }> {
    const tid = new Types.ObjectId(tenantId);

    const [reservations, eventRegs] = await Promise.all([
      this.reservationModel.find({ tenantId: tid }).lean().exec(),
      this.eventRegModel.find({ tenantId: tid }).lean().exec(),
    ]);

    const contacts = new Map<
      string,
      { name: string; phone?: string; source: string; lastVisit?: Date }
    >();

    for (const er of eventRegs) {
      contacts.set(er.email.toLowerCase(), {
        name: er.name,
        phone: er.phone,
        source: 'event',
      });
    }
    for (const r of reservations) {
      const lastVisit = r.date ? new Date(r.date) : undefined;
      contacts.set(r.guestEmail.toLowerCase(), {
        name: r.guestName,
        phone: r.guestPhone,
        source: 'reservation',
        lastVisit,
      });
    }

    if (contacts.size === 0) return { imported: 0, updated: 0 };

    const ops = Array.from(contacts.entries()).map(([email, data]) => ({
      updateOne: {
        filter: { email, tenantId: tid, createdBy: { $exists: false } },
        update: {
          $setOnInsert: { source: data.source, tags: [] },
          $set: {
            name: data.name,
            ...(data.phone ? { phone: data.phone } : {}),
            ...(data.lastVisit ? { lastVisit: data.lastVisit } : {}),
          },
        },
        upsert: true,
      },
    }));

    const result = await this.customerModel.bulkWrite(ops);

    const emailList = Array.from(contacts.keys());
    await Promise.all(
      emailList.map(async (email) => {
        const [resCount, evCount] = await Promise.all([
          this.reservationModel.countDocuments({
            tenantId: tid,
            guestEmail: { $regex: new RegExp(`^${email}$`, 'i') },
          }),
          this.eventRegModel.countDocuments({
            tenantId: tid,
            email: { $regex: new RegExp(`^${email}$`, 'i') },
          }),
        ]);
        await this.customerModel.updateOne(
          { email, tenantId: tid, createdBy: { $exists: false } },
          { $set: { totalReservations: resCount, totalEvents: evCount } },
        );
      }),
    );

    return { imported: result.upsertedCount, updated: result.modifiedCount };
  }

  async exportCsv(
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<string> {
    const customers = await this.findAll(tenantId, userId, role);
    const header =
      'Nombre,Email,Teléfono,Tags,Origen,Última visita,Reservas,Eventos\n';
    const rows = customers
      .map((c) =>
        [
          c.name,
          c.email ?? '',
          c.phone ?? '',
          c.tags.join(';'),
          c.source,
          c.lastVisit ? c.lastVisit.toISOString().split('T')[0] : '',
          c.totalReservations,
          c.totalEvents,
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n');
    return header + rows;
  }
}
