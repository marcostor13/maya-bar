import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Automation,
  AutomationRun,
  AutomationRunSchema,
  AutomationSchema,
} from './automation.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import {
  ContactActivity,
  ContactActivitySchema,
} from '../customers/contact-activity.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import {
  LeadActivity,
  LeadActivitySchema,
} from '../leads/lead-activity.schema';
import {
  Conversation,
  ConversationSchema,
} from '../conversations/conversation.schema';
import { Message, MessageSchema } from '../conversations/message.schema';
import {
  WaTemplate,
  WaTemplateSchema,
} from '../whatsapp-templates/wa-template.schema';
import { Tenant, TenantSchema } from '../tenants/tenant.schema';
import { Event, EventSchema } from '../events/event.schema';
import { ConversationsModule } from '../conversations/conversations.module';
import { WhatsAppAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';
import { SuppressionModule } from '../suppression/suppression.module';
import { SmsModule } from '../sms/sms.module';
import { ResendModule } from '../resend/resend.module';
import { MailModule } from '../mail/mail.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { LeadsModule } from '../leads/leads.module';
import { AutomationsService } from './automations.service';
import { AutomationEngineService } from './automation-engine.service';
import { AutomationsController } from './automations.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Automation.name, schema: AutomationSchema },
      { name: AutomationRun.name, schema: AutomationRunSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: ContactActivity.name, schema: ContactActivitySchema },
      { name: Lead.name, schema: LeadSchema },
      { name: LeadActivity.name, schema: LeadActivitySchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: WaTemplate.name, schema: WaTemplateSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: Event.name, schema: EventSchema },
    ]),
    ConversationsModule,
    WhatsAppAccountsModule,
    SuppressionModule,
    SmsModule,
    ResendModule,
    MailModule,
    CampaignsModule,
    LeadsModule,
  ],
  controllers: [AutomationsController],
  providers: [AutomationsService, AutomationEngineService],
  exports: [AutomationEngineService],
})
export class AutomationsModule {}
