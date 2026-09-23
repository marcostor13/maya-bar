import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import {
  Conversation,
  ConversationSchema,
} from '../conversations/conversation.schema';
import { Message, MessageSchema } from '../conversations/message.schema';
import { AiAgent, AiAgentSchema } from '../ai-agents/ai-agent.schema';
import { LeadsModule } from '../leads/leads.module';
import { Lead, LeadSchema } from '../leads/lead.schema';
import { Campaign, CampaignSchema } from '../campaigns/campaign.schema';
import {
  FormSubmission,
  FormSubmissionSchema,
} from '../forms/form-submission.schema';
import { ContactForm, ContactFormSchema } from '../forms/form.schema';
import {
  EventRegistration,
  EventRegistrationSchema,
} from '../events/event-registration.schema';
import {
  RecoveryPlan,
  RecoveryPlanSchema,
} from '../recovery/recovery-plan.schema';
import { Prospect, ProspectSchema } from '../prospecting/prospect.schema';
import {
  SuppressionEntry,
  SuppressionEntrySchema,
} from '../suppression/suppression-entry.schema';
import { DashboardAnalyticsService } from './dashboard-analytics.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: AiAgent.name, schema: AiAgentSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: Campaign.name, schema: CampaignSchema },
      { name: FormSubmission.name, schema: FormSubmissionSchema },
      { name: ContactForm.name, schema: ContactFormSchema },
      { name: EventRegistration.name, schema: EventRegistrationSchema },
      { name: RecoveryPlan.name, schema: RecoveryPlanSchema },
      { name: Prospect.name, schema: ProspectSchema },
      { name: SuppressionEntry.name, schema: SuppressionEntrySchema },
    ]),
    // El bloque de seguimiento reutiliza las métricas del tablero de leads en
    // vez de recalcularlas: son las mismas y deben cuadrar entre pantallas.
    LeadsModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardAnalyticsService],
})
export class DashboardModule {}
