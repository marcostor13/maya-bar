import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import {
  OnboardingTask,
  type OnboardingStatus,
} from './onboarding-task.schema';
import { CheckoutService } from '../checkout.service';
import { CheckoutSession } from '../checkout-session.schema';
import { BillingMailer } from '../emails/billing-mailer.service';
import { T } from '../emails/billing-email.templates';
import { User } from '../../users/user.schema';
import { SETUP_PACKAGES, isSetupId } from '../setup.catalog';

export const ONBOARDING_STATUSES: OnboardingStatus[] = [
  'pending',
  'scheduled',
  'in_progress',
  'done',
];

/**
 * Tareas de implementación (HU55): una por compra con implementación pagada,
 * con el contacto, el paquete y su checklist. Las ve y avanza el superadmin.
 */
@Injectable()
export class OnboardingService implements OnModuleInit {
  constructor(
    @InjectModel(OnboardingTask.name) private tasks: Model<OnboardingTask>,
    @InjectModel(CheckoutSession.name)
    private sessions: Model<CheckoutSession>,
    @InjectModel(User.name) private users: Model<User>,
    private checkout: CheckoutService,
    private mailer: BillingMailer,
    private config: ConfigService,
  ) {}

  onModuleInit() {
    this.checkout.onSetupPaid((s) => this.fromSession(s));
  }

  private bookingUrl() {
    return (
      this.config.get<string>('ONBOARDING_BOOKING_URL') ||
      this.mailer.frontendUrl('/settings/plan')
    );
  }

  /** Crea la tarea (idempotente por compra) y avisa al cliente y al equipo. */
  async fromSession(s: CheckoutSession): Promise<void> {
    if (!s.setup || !isSetupId(s.setup.id)) return;
    const pkg = SETUP_PACKAGES[s.setup.id];
    const tenantId = s.tenantId ?? s.provision?.tenantId;
    await this.tasks
      .updateOne(
        { sessionPublicId: s.publicId },
        {
          $setOnInsert: {
            sessionPublicId: s.publicId,
            package: pkg.id,
            packageName: pkg.name,
            plan: s.plan,
            period: s.period,
            contact: {
              company: s.buyer.company,
              name: s.buyer.name,
              email: s.buyer.email,
              ...(s.buyer.phone ? { phone: s.buyer.phone } : {}),
            },
            checklist: pkg.checklist.map((label) => ({ label, done: false })),
            status: 'pending',
            paidAt: s.setup.paidAt ?? new Date(),
          },
          ...(tenantId ? { $set: { tenantId } } : {}),
        },
        { upsert: true },
      )
      .exec();
    await this.mailer.trySend({
      key: `onboarding:${s.publicId}:client`,
      type: 'onboarding',
      to: [s.buyer.email],
      ...(tenantId ? { tenantId } : {}),
      content: T.onboarding({
        name: s.buyer.name,
        pkg: pkg.name,
        bookingUrl: this.bookingUrl(),
        items: pkg.checklist,
      }),
    });
    const team = (
      await this.users
        .find({ role: 'SUPERADMIN', isActive: { $ne: false } })
        .select('email')
        .lean()
        .exec()
    ).map((u) => u.email);
    if (team.length)
      await this.mailer.trySend({
        key: `onboarding:${s.publicId}:team`,
        type: 'onboarding_task',
        to: team,
        content: T.onboardingTask({
          company: s.buyer.company,
          pkg: pkg.name,
          email: s.buyer.email,
          phone: s.buyer.phone,
          url: this.mailer.frontendUrl('/admin/onboarding'),
        }),
      });
  }

  /** Lista para el superadmin; completa la empresa si el alta terminó después. */
  async list(status?: string) {
    const filter =
      status && (ONBOARDING_STATUSES as string[]).includes(status)
        ? { status: status as OnboardingStatus }
        : {};
    const rows = await this.tasks
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean()
      .exec();
    for (const r of rows.filter((x) => !x.tenantId)) {
      const s = await this.sessions
        .findOne({ publicId: r.sessionPublicId })
        .select('tenantId provision')
        .lean()
        .exec();
      const tid = s?.tenantId ?? s?.provision?.tenantId;
      if (tid) {
        r.tenantId = tid;
        await this.tasks
          .updateOne({ _id: r._id }, { $set: { tenantId: tid } })
          .exec();
      }
    }
    return rows;
  }

  async update(
    id: string,
    p: {
      status?: string;
      notes?: string;
      checklist?: { index: number; done: boolean }[];
    },
  ) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Tarea no encontrada');
    const t = await this.tasks.findById(id).exec();
    if (!t) throw new NotFoundException('Tarea no encontrada');
    if (p.status !== undefined) {
      if (!(ONBOARDING_STATUSES as string[]).includes(p.status))
        throw new BadRequestException('Estado no válido');
      t.status = p.status as OnboardingStatus;
    }
    if (p.notes !== undefined) t.notes = p.notes.slice(0, 2000);
    for (const c of p.checklist ?? []) {
      if (!t.checklist[c.index])
        throw new BadRequestException('Paso no válido');
      t.checklist[c.index].done = !!c.done;
    }
    t.markModified('checklist');
    await t.save();
    return t.toObject();
  }
}
