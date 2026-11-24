import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MailModule } from '../mail/mail.module';
import { Lead, LeadSchema } from '../leads/lead.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import {
  Conversation,
  ConversationSchema,
} from '../conversations/conversation.schema';
import { Campaign, CampaignSchema } from '../campaigns/campaign.schema';
import {
  EventRegistration,
  EventRegistrationSchema,
} from '../events/event-registration.schema';
import { Event, EventSchema } from '../events/event.schema';
import { User, UserSchema } from '../users/user.schema';
import { Report, ReportSchema } from './report.schema';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

/** Reportes configurables (HU64). */
@Module({
  imports: [
    MailModule,
    MongooseModule.forFeature([
      { name: Report.name, schema: ReportSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Campaign.name, schema: CampaignSchema },
      { name: EventRegistration.name, schema: EventRegistrationSchema },
      { name: Event.name, schema: EventSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
