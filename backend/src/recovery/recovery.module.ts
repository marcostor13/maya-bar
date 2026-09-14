import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RecoveryController } from './recovery.controller';
import { RecoveryService } from './recovery.service';
import { RecoveryAnalysisService } from './recovery-analysis.service';
import { RecoveryPlan, RecoveryPlanSchema } from './recovery-plan.schema';
import {
  Conversation,
  ConversationSchema,
} from '../conversations/conversation.schema';
import { Message, MessageSchema } from '../conversations/message.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { AiAgent, AiAgentSchema } from '../ai-agents/ai-agent.schema';
import { AiModule } from '../ai/ai.module';
import { SettingsModule } from '../settings/settings.module';
import { WhatsAppTemplatesModule } from '../whatsapp-templates/whatsapp-templates.module';
import { WhatsAppAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RecoveryPlan.name, schema: RecoveryPlanSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: AiAgent.name, schema: AiAgentSchema },
    ]),
    AiModule,
    SettingsModule,
    WhatsAppTemplatesModule,
    WhatsAppAccountsModule,
  ],
  controllers: [RecoveryController],
  providers: [RecoveryService, RecoveryAnalysisService],
})
export class RecoveryModule {}
