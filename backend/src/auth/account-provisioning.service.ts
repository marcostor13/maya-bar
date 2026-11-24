import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash, randomBytes } from 'crypto';
import { Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import { TenantsService } from '../tenants/tenants.service';
import { MailService } from '../mail/mail.service';
import { CheckoutService } from '../billing/checkout.service';
import type { CheckoutSession } from '../billing/checkout-session.schema';
import { PLANS } from '../billing/plans.catalog';
import type { User } from '../users/user.schema';
import { BillingMailer } from '../billing/emails/billing-mailer.service';
import { PlanChangeService } from '../billing/plan-change.service';
import { AddonsService } from '../billing/addons.service';
import { CouponsService } from '../billing/coupons/coupons.service';
import { ADDONS, isAddonId } from '../billing/addons.catalog';
import { T, type PlanInfo } from '../billing/emails/billing-email.templates';

/** El enlace de acceso tras pagar vale 72 horas (HU47 C3). */
export const ACCESS_TTL_MS = 72 * 3600_000;
const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/**
 * Alta automática tras el pago (HU47). Se engancha a `CheckoutService.onPaid`:
 * cliente nuevo → empresa activa + administrador + enlace de acceso; cuenta
 * existente → activa el plan en su empresa. Idempotente: la sesión pasa a
 * `fulfilled` y un segundo aviso no hace nada.
 */
@Injectable()
export class AccountProvisioningService implements OnModuleInit {
  private readonly logger = new Logger(AccountProvisioningService.name);

  constructor(
    private users: UsersService,
    private tenants: TenantsService,
    private mail: MailService,
    private config: ConfigService,
    @Optional() private checkout?: CheckoutService,
    @Optional() private mailer?: BillingMailer,
    @Optional() private planChange?: PlanChangeService,
    @Optional() private addons?: AddonsService,
    @Optional() private coupons?: CouponsService,
  ) {}

  onModuleInit() {
    this.checkout?.onPaid((s) => this.fulfill(s));
  }

  private frontendUrl() {
    return (
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:4200'
    ).replace(/\/+$/, '');
  }

  /**
   * Alta reanudable: se reclama la sesión de forma atómica y cada paso se
   * anota al terminar. Un fallo suelta el candado y relanza el error para que
   * el evento de cobro se reintente y continúe donde quedó (HU47 C2).
   */
  async fulfill(session: CheckoutSession): Promise<void> {
    const checkout = this.checkout!;
    const claimed = await checkout.claimProvisioning(session.publicId);
    if (!claimed) return; // ya activa, aún sin pagar u otro proceso la trabaja
    try {
      await this.provision(claimed);
    } catch (err) {
      await checkout.releaseProvisioning(claimed._id);
      throw err;
    }
  }

  /**
   * Red de seguridad: si un alta falló, el cobro ya no vuelve a avisar (su
   * estado no cambia), así que cada minuto se retoman las pagadas sin cuenta.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async resumePending(): Promise<number> {
    if (!this.checkout) return 0;
    const pending = await this.checkout.findUnfulfilledPaid();
    let ok = 0;
    for (const s of pending)
      await this.fulfill(s).then(
        () => ok++,
        (e) => this.logger.error(`Alta ${s.publicId} falló: ${String(e)}`),
      );
    return ok;
  }

  private async provision(s: CheckoutSession): Promise<void> {
    const checkout = this.checkout!;
    const id = s._id;
    const done = { ...(s.provision ?? {}) };
    const step = async (patch: typeof done) => {
      Object.assign(done, patch);
      await checkout.saveProvision(id, patch);
    };
    const email = s.buyer.email.trim().toLowerCase();

    // 1) Decidir a qué empresa va el plan (una sola vez).
    if (!done.tenantId) {
      if (s.tenantId) {
        await step({ branch: 'account', tenantId: s.tenantId });
      } else {
        const existing = await this.users.findOneByEmailAnyStatus(email);
        if (
          existing?.tenantId &&
          existing.role === 'TENANT_ADMIN' &&
          existing.emailVerified !== false
        ) {
          await step({
            branch: 'existing',
            tenantId: new Types.ObjectId(String(existing.tenantId)),
          });
        } else {
          let conflict = false;
          // Un registro sin confirmar con ese correo nunca pudo entrar: se descarta.
          if (existing?.emailVerified === false && existing.tenantId)
            await this.tenants.remove(String(existing.tenantId));
          else if (existing) conflict = true;
          const tenant = await this.tenants.create({
            name: await this.tenants.uniqueName(s.buyer.company),
            email: conflict ? `checkout+${s.publicId}@mayacrm.site` : email,
            phone: s.buyer.phone,
            ...(s.billing.docType === 'factura'
              ? { ruc: s.billing.docNumber }
              : {}),
          });
          // Se anota en cuanto existe: un reintento no crea "Empresa 2".
          await step({
            branch: conflict ? 'conflict' : 'new',
            tenantId: tenant._id,
          });
        }
      }
    }
    const tenantId = new Types.ObjectId(String(done.tenantId));

    // 2) Activar el plan una sola vez (un reintento no suma otro periodo).
    if (!done.planActivated && s.kind === 'addon' && this.addons) {
      // Add-on o recarga pagada (HU53): no toca el plan ni el periodo.
      if (isAddonId(s.addonId))
        await this.addons.apply(
          tenantId,
          s.addonId,
          s.addonQty ?? 1,
          s.publicId,
        );
      await step({ planActivated: true });
    }
    if (!done.planActivated && s.kind === 'upgrade' && this.planChange) {
      // Subida pagada (HU52): cambia el plan, no suma periodo.
      await this.planChange.applyPaidUpgrade(tenantId, s);
      await step({ planActivated: true });
    }
    if (!done.planActivated) {
      await this.tenants.activatePlan(tenantId, {
        plan: s.plan,
        period: s.period,
        currency: s.currency,
        amount: s.subtotal,
        mpPreapprovalId: s.mpPreapprovalId,
        ...(s.coupon ? { coupon: s.coupon } : {}),
        ...(s.renewal ? { renewal: true } : {}),
      });
      // Pago aprobado de una reserva de cupón ya liberada (HU54): vuelve a contar, una vez.
      if (s.coupon && this.coupons)
        await this.coupons.reclaimSession(s.publicId);
      // Bajada programada que entra con esta renovación, y ajuste de usuarios.
      if (this.planChange) await this.planChange.settleUsers(tenantId);
      await step({ planActivated: true });
    }

    // 3) Datos de facturación del checkout, también en cuentas existentes (HU49).
    if (!done.billingSaved) {
      await this.tenants.setBillingInfo(tenantId, { ...s.billing });
      await step({ billingSaved: true });
    }

    // 4) Acceso: administrador nuevo + enlace, o aviso al superadmin.
    if (done.branch === 'new') {
      if (!done.userId) {
        const user =
          (await this.users.findOneByEmailAnyStatus(email)) ??
          (await this.users.create({
            email,
            password: randomBytes(24).toString('base64url'),
            name: s.buyer.name,
            role: 'TENANT_ADMIN',
            tenantId,
            emailVerified: true,
          }));
        await step({ userId: user._id });
      }
      if (!done.accessSent) {
        const user = await this.users.findById(String(done.userId));
        if (user)
          await this.sendAccess(user, {
            key: `welcome:${s.publicId}`,
            info: await this.planInfo(s, tenantId),
          });
        await step({ accessSent: true });
      }
    } else if (done.branch === 'conflict' && !done.notified) {
      this.logger.warn(
        `Pago ${s.publicId}: el correo ya es de otra cuenta; empresa creada sin usuario`,
      );
      await this.notifySuperadmins(s, tenantId);
      await step({ notified: true });
    }

    // Cliente existente: "Pago confirmado" (HU50), una sola vez por compra.
    if (
      (done.branch === 'account' || done.branch === 'existing') &&
      this.mailer
    )
      await this.mailer.trySend({
        key: `paid:${s.publicId}`,
        type: 'payment_confirmed',
        to: await this.mailer.recipients(tenantId),
        tenantId,
        content: T.paymentConfirmed({
          ...(await this.planInfo(s, tenantId)),
          accountUrl: this.mailer.frontendUrl('/settings/plan'),
        }),
      });

    await checkout.markFulfilled(id, tenantId);
  }

  /** Plan, monto y próxima fecha para los correos. */
  private async planInfo(
    s: CheckoutSession,
    tenantId: Types.ObjectId,
  ): Promise<PlanInfo> {
    const t = await this.tenants.findById(String(tenantId)).catch(() => null);
    const addon = s.kind === 'addon' && isAddonId(s.addonId);
    if (addon)
      return {
        planName: ADDONS[s.addonId as keyof typeof ADDONS].name,
        amount: s.total,
        currency: s.currency,
        purchase: true,
      };
    const setupWithPlan = !!s.setup && !s.setup.separate;
    return {
      planName: PLANS[s.plan].name,
      period: s.period,
      amount: setupWithPlan
        ? Math.round((s.total + s.setup!.total) * 100) / 100
        : s.total,
      currency: s.currency,
      nextDate: t?.subscription?.currentPeriodEnd,
      ...(s.setup
        ? {
            setup: {
              name: s.setup.name,
              ...(s.setup.separate && !s.setup.paidAt && s.setup.redirectUrl
                ? { payUrl: s.setup.redirectUrl }
                : {}),
            },
          }
        : {}),
    };
  }

  /**
   * Genera un enlace nuevo de un solo uso y lo manda por correo. Con `welcome`
   * es el correo de bienvenida de la compra (HU50): sale una sola vez.
   */
  async sendAccess(
    user: User,
    welcome?: { key: string; info: PlanInfo },
  ): Promise<void> {
    // Si la bienvenida ya salió, no se cambia el token (el enlace del correo sigue valiendo).
    if (welcome && (await this.mailer?.wasSent(welcome.key))) return;
    const token = randomBytes(32).toString('base64url');
    user.accessTokenHash = sha256(token);
    user.accessTokenExpires = new Date(Date.now() + ACCESS_TTL_MS);
    user.accessPending = true;
    await user.save();
    const accessUrl = `${this.frontendUrl()}/acceso?token=${token}&email=${encodeURIComponent(user.email)}`;
    if (welcome && this.mailer) {
      // Solo al comprador: el enlace da acceso a la cuenta, no va en copia.
      // El token no queda en la bitácora.
      await this.mailer.send({
        key: welcome.key,
        type: 'welcome',
        to: user.email,
        tenantId: user.tenantId,
        content: T.welcome({ ...welcome.info, name: user.name, accessUrl }),
        redact: [token, encodeURIComponent(token)],
      });
      return;
    }
    const c = T.access({ name: user.name, accessUrl });
    await this.mail.sendHtml({
      to: user.email,
      subject: c.subject,
      html: c.html,
      text: c.text,
    });
  }

  /** Canjea el enlace: fija la contraseña y lo invalida (HU47 C3). */
  async redeem(email: string, token: string, password: string): Promise<User> {
    // Atómico: con dos peticiones simultáneas del mismo token, solo una pasa.
    const user = await this.users.consumeAccessToken(email, sha256(token));
    if (!user)
      throw new BadRequestException({
        message: 'El enlace ya se usó o venció. Pide uno nuevo.',
        code: 'ACCESS_LINK_INVALID',
      });
    return this.users.resetPassword(String(user._id), password);
  }

  /** "Reenviar acceso": solo para cuentas que aún no crearon contraseña. */
  async resend(email: string): Promise<void> {
    const user = await this.users.findOneByEmail(email);
    if (user?.accessPending) await this.sendAccess(user);
  }

  private async notifySuperadmins(
    s: CheckoutSession,
    tenantId: Types.ObjectId,
  ) {
    const tenantName = (await this.tenants.findById(String(tenantId))).name;
    const to = await this.users.superadminEmails().catch(() => [] as string[]);
    for (const addr of to)
      await this.mail
        .sendHtml({
          to: addr,
          subject: `Revisar alta: ${tenantName}`,
          html: `<p>Se pagó el plan ${escapeHtml(PLANS[s.plan].name)} (compra ${escapeHtml(s.publicId)}) con un correo que ya pertenece a otra cuenta. Se creó la empresa <b>${escapeHtml(tenantName)}</b> sin usuario: crea el acceso a mano.</p>`,
        })
        .catch((e) => this.logger.error(`Aviso al superadmin: ${String(e)}`));
  }
}
