import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { Lead, LeadSchema } from './lead.schema';
import { LeadActivity, LeadActivitySchema } from './lead-activity.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { User, UserSchema } from '../users/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Lead.name, schema: LeadSchema },
      { name: LeadActivity.name, schema: LeadActivitySchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [LeadsController],
  providers: [LeadsService],
  // La bandeja de entrada crea contactos y oportunidades desde el chat.
  exports: [LeadsService],
})
export class LeadsModule {}
