import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Tenant, TenantSchema } from '../tenants/tenant.schema';
import { User, UserSchema } from '../users/user.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import {
  Conversation,
  ConversationSchema,
} from '../conversations/conversation.schema';
import { TenantsModule } from '../tenants/tenants.module';
import { AgencyService } from './agency.service';
import { AgencyController } from './agency.controller';

/** Plan Agencia, sub-cuentas y marca blanca (HU72). */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Tenant.name, schema: TenantSchema },
      { name: User.name, schema: UserSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Conversation.name, schema: ConversationSchema },
    ]),
    TenantsModule,
  ],
  controllers: [AgencyController],
  providers: [AgencyService],
  exports: [AgencyService],
})
export class AgencyModule {}
