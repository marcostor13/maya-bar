import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MailService } from '../../mail/mail.service';
import { Tenant } from '../../tenants/tenant.schema';
import { User } from '../../users/user.schema';
import { BillingEmail } from './billing-email.schema';
import type { EmailContent } from './billing-email.templates';

/** Tiempo que un envío reserva su clave; si el proceso muere, otro lo retoma. */
const LOCK_MS = 2 * 60_000;

export interface SendEmail {
  /** Clave única del aviso: `welcome:<compra>`, `receipt:<pago>:receipt`… */
  key: string;
  type: string;
  to: string | string[];
  content: EmailContent;
  tenantId?: Types.ObjectId | string;
  paymentId?: string;
}

/**
 * Envío de los correos de cobro (HU50) con bitácora `billing_emails`.
 */
@Injectable()
export class BillingMailer {
  private readonly logger = new Logger(BillingMailer.name);

  constructor(
    @InjectModel(BillingEmail.name) private log: Model<BillingEmail>,
    @InjectModel(Tenant.name) private tenants: Model<Tenant>,
    @InjectModel(User.name) private users: Model<User>,
    private mail: MailService,
    private config: ConfigService,
  ) {}

  frontendUrl(path = '') {
    return `${(this.config.get<string>('FRONTEND_URL') || 'http://localhost:4200').replace(/\/+$/, '')}${path}`;
  }

  /** ¿Ya llegó a todos sus destinatarios? */
  async wasSent(key: string): Promise<boolean> {
    return !!(await this.log.exists({ key, sentAt: { $exists: true } }));
  }

  /**
   * Envía una sola vez por `key`. Devuelve true si terminó de enviarse ahora
   * y false si ya había salido o otro proceso lo está enviando.
   *
   * Se anota cada destinatario entregado: si falla a medias, el reintento
   * solo envía a los que faltan (nadie lo recibe dos veces) y el registro
   * nunca se borra, así el superadmin lo ve y puede reenviarlo. `redact`
   * quita de la copia guardada lo que no debe quedar en la base (tokens).
   */
  async send(e: SendEmail & { redact?: string[] }): Promise<boolean> {
    const to = [
      ...new Set(
        (Array.isArray(e.to) ? e.to : [e.to])
          .filter(Boolean)
          .map((t) => t.trim().toLowerCase()),
      ),
    ];
    if (!to.length) return false;
    const hide = (v: string) =>
      (e.redact ?? [])
        .filter(Boolean)
        .reduce((acc, r) => acc.split(r).join('[oculto]'), v);
    const now = new Date();
    let doc: BillingEmail | null;
    try {
      doc = await this.log
        .findOneAndUpdate(
          {
            key: e.key,
            sentAt: { $exists: false },
            $or: [
              { lockedUntil: { $exists: false } },
              { lockedUntil: { $lt: now } },
            ],
          },
          {
            $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) },
            $setOnInsert: {
              type: e.type,
              tenantId: e.tenantId
                ? new Types.ObjectId(String(e.tenantId))
                : undefined,
              paymentId: e.paymentId,
              to,
              subject: e.content.subject,
              html: hide(e.content.html),
              text: hide(e.content.text),
              redacted: !!e.redact?.length,
              delivered: [],
              resends: 0,
            },
          },
          { upsert: true, returnDocument: 'after' },
        )
        .exec();
    } catch (err) {
      // Clave duplicada: ya salió, o lo está enviando otro proceso.
      if ((err as { code?: number }).code === 11000) return false;
      throw err;
    }
    if (!doc) return false;
    try {
      for (const addr of to) {
        if (doc.delivered?.includes(addr)) continue;
        await this.deliverOne(addr, e.content);
        await this.log
          .updateOne({ _id: doc._id }, { $addToSet: { delivered: addr } })
          .exec();
      }
      await this.log
        .updateOne(
          { _id: doc._id },
          { $set: { sentAt: new Date() }, $unset: { lockedUntil: '' } },
        )
        .exec();
      return true;
    } catch (err) {
      await this.log
        .updateOne({ _id: doc._id }, { $unset: { lockedUntil: '' } })
        .exec();
      throw err;
    }
  }

  private deliverOne(to: string, c: EmailContent) {
    return this.mail.sendHtml({
      to,
      subject: c.subject,
      html: c.html,
      text: c.text,
    });
  }

  /** Como `send`, pero un fallo solo se registra: un correo nunca frena el cobro. */
  async trySend(e: SendEmail): Promise<boolean> {
    try {
      return await this.send(e);
    } catch (err) {
      this.logger.error(`Correo ${e.key}: ${String(err)}`);
      return false;
    }
  }

  /** Administrador principal de la empresa + correo de facturación si es otro. */
  async recipients(tenantId: Types.ObjectId | string): Promise<string[]> {
    const tenant = await this.tenants.findById(tenantId).lean().exec();
    if (!tenant) return [];
    const admin = await this.users
      .findOne({ tenantId: tenant._id, role: 'TENANT_ADMIN', isActive: true })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    const billing = (tenant as unknown as { billingInfo?: { email?: string } })
      .billingInfo?.email;
    return [admin?.email ?? tenant.email, billing].filter(
      (x): x is string => !!x,
    );
  }

  /** Bitácora para el superadmin. */
  list(tenantId?: string) {
    return this.log
      .find(
        tenantId && Types.ObjectId.isValid(tenantId)
          ? { tenantId: new Types.ObjectId(tenantId) }
          : {},
      )
      .sort({ createdAt: -1 })
      .limit(200)
      .select(
        'key type tenantId paymentId to delivered subject sentAt resends createdAt',
      )
      .lean()
      .exec();
  }

  /** Reenvío manual desde superadmin: mismo contenido, mismos destinatarios. */
  /** Id del correo de la bitácora con esa clave (para reenviarlo, HU57). */
  async idByKey(key: string): Promise<string | null> {
    const doc = await this.log.findOne({ key }).select('_id').lean().exec();
    return doc ? String(doc._id) : null;
  }

  async resend(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    const doc = await this.log.findById(id).exec();
    if (!doc) throw new NotFoundException('Correo no encontrado');
    // La copia guardada no tiene el enlace de acceso: ese se pide de nuevo.
    if (doc.redacted)
      throw new BadRequestException(
        'Este correo lleva un enlace de acceso: usa "Reenviar acceso" para generar uno nuevo.',
      );
    for (const addr of doc.to)
      await this.deliverOne(addr, {
        subject: doc.subject,
        html: doc.html,
        text: doc.text ?? '',
      });
    doc.resends += 1;
    doc.sentAt = new Date();
    await doc.save();
  }
}
