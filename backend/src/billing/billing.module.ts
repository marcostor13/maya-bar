import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { Tenant, TenantSchema } from '../tenants/tenant.schema';
import { PublicPlansController } from './public-plans.controller';
import { BillingMigrationService } from './billing-migration.service';
import { BillingAccessService } from './billing-access.service';
import { BillingController } from './billing.controller';
import { ReadOnlyInterceptor } from './read-only.interceptor';
import { PlanLimitsService } from './plan-limits.service';
import { AiCreditsService } from './ai-credits.service';
import { UsageLedger, UsageLedgerSchema } from './usage-ledger.schema';
import { Payment, PaymentSchema } from './payment.schema';
import { BillingEvent, BillingEventSchema } from './billing-event.schema';
import { MercadoPagoClient } from './mercadopago/mercadopago.client';
import { BillingHooks } from './billing-hooks.service';
import { PaymentsService } from './payments.service';
import { BillingEventsService } from './billing-events.service';
import { MercadoPagoWebhookController } from './mercadopago-webhook.controller';
import {
  CheckoutSession,
  CheckoutSessionSchema,
} from './checkout-session.schema';
import { CheckoutService } from './checkout.service';
import {
  AccountCheckoutController,
  PublicCheckoutController,
} from './checkout.controller';
import { TurnstileService } from '../auth/turnstile.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { MailModule } from '../mail/mail.module';
import { InvoicingService } from './invoicing/invoicing.service';
import { BillingMailer } from './emails/billing-mailer.service';
import { PastDueService } from './past-due.service';
import { PlanChangeService } from './plan-change.service';
import { PlanChangeController } from './plan-change.controller';
import { AddonsController } from './addons.controller';
import { AddonsService } from './addons.service';
import { CouponsService } from './coupons/coupons.service';
import { OnboardingService } from './onboarding/onboarding.service';
import { OnboardingController } from './onboarding/onboarding.controller';
import {
  OnboardingTask,
  OnboardingTaskSchema,
} from './onboarding/onboarding-task.schema';
import { Coupon, CouponSchema } from './coupons/coupon.schema';
import { BillingNoticesService } from './emails/billing-notices.service';
import {
  BillingEmail,
  BillingEmailSchema,
} from './emails/billing-email.schema';
import { NubefactProvider } from './invoicing/nubefact.provider';
import { INVOICE_PROVIDER } from './invoicing/invoice-provider';
import {
  InvoiceCounter,
  InvoiceCounterSchema,
} from './invoicing/invoice-counter.schema';
import { User, UserSchema } from '../users/user.schema';

/**
 * Planes, cobro y comprobantes (HU40+). Global: el estado de cobro lo
 * consultan módulos que no deberían depender de este (agente IA, campañas).
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Tenant.name, schema: TenantSchema },
      { name: UsageLedger.name, schema: UsageLedgerSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Coupon.name, schema: CouponSchema },
      { name: OnboardingTask.name, schema: OnboardingTaskSchema },
      { name: BillingEvent.name, schema: BillingEventSchema },
      { name: CheckoutSession.name, schema: CheckoutSessionSchema },
      { name: User.name, schema: UserSchema },
      { name: InvoiceCounter.name, schema: InvoiceCounterSchema },
      { name: BillingEmail.name, schema: BillingEmailSchema },
    ]),
    MailModule,
  ],
  controllers: [
    PublicPlansController,
    BillingController,
    MercadoPagoWebhookController,
    PublicCheckoutController,
    AccountCheckoutController,
    PlanChangeController,
    AddonsController,
    OnboardingController,
  ],
  providers: [
    BillingMigrationService,
    BillingAccessService,
    PlanLimitsService,
    AiCreditsService,
    MercadoPagoClient,
    BillingHooks,
    PaymentsService,
    SubscriptionLifecycleService,
    NubefactProvider,
    { provide: INVOICE_PROVIDER, useExisting: NubefactProvider },
    InvoicingService,
    BillingMailer,
    BillingNoticesService,
    PastDueService,
    PlanChangeService,
    AddonsService,
    CouponsService,
    OnboardingService,
    BillingEventsService,
    CheckoutService,
    TurnstileService,
    { provide: APP_INTERCEPTOR, useClass: ReadOnlyInterceptor },
  ],
  exports: [
    InvoicingService,
    BillingAccessService,
    PlanLimitsService,
    AiCreditsService,
    MercadoPagoClient,
    BillingHooks,
    PaymentsService,
    CheckoutService,
    BillingMailer,
    PlanChangeService,
    AddonsService,
    CouponsService,
  ],
})
export class BillingModule {}
