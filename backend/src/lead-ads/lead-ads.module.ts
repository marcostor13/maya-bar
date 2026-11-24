import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  LeadAdForm,
  LeadAdFormSchema,
  LeadAdLead,
  LeadAdLeadSchema,
} from './lead-ads.schema';
import {
  MessengerAccount,
  MessengerAccountSchema,
} from '../messenger-accounts/messenger-account.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import {
  LeadActivity,
  LeadActivitySchema,
} from '../leads/lead-activity.schema';
import { LeadsModule } from '../leads/leads.module';
import { LeadAdsService } from './lead-ads.service';
import { LeadAdsController } from './lead-ads.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LeadAdForm.name, schema: LeadAdFormSchema },
      { name: LeadAdLead.name, schema: LeadAdLeadSchema },
      { name: MessengerAccount.name, schema: MessengerAccountSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: LeadActivity.name, schema: LeadActivitySchema },
    ]),
    LeadsModule,
  ],
  controllers: [LeadAdsController],
  providers: [LeadAdsService],
  exports: [LeadAdsService],
})
export class LeadAdsModule {}
