import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';
import { Tenant, TenantSchema } from '../tenants/tenant.schema';
import { Payment, PaymentSchema } from '../billing/payment.schema';
import { User, UserSchema } from '../users/user.schema';
import {
  OnboardingTask,
  OnboardingTaskSchema,
} from '../billing/onboarding/onboarding-task.schema';
import { AdminAction, AdminActionSchema } from './admin-action.schema';
import { SubscriptionsAdminService } from './subscriptions-admin.service';
import { SubscriptionsAdminController } from './subscriptions-admin.controller';

/**
 * Panel de suscripciones e ingresos del superadmin (HU57). Aparte de
 * BillingModule porque usa el alta de cuentas (AuthModule), que ya depende de él.
 */
@Module({
  imports: [
    AuthModule,
    TenantsModule,
    MongooseModule.forFeature([
      { name: Tenant.name, schema: TenantSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: User.name, schema: UserSchema },
      { name: OnboardingTask.name, schema: OnboardingTaskSchema },
      { name: AdminAction.name, schema: AdminActionSchema },
    ]),
  ],
  controllers: [SubscriptionsAdminController],
  providers: [SubscriptionsAdminService],
})
export class BillingAdminModule {}
