import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import {
  ContactActivity,
  ContactActivitySchema,
} from '../customers/contact-activity.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import {
  Conversation,
  ConversationSchema,
} from '../conversations/conversation.schema';
import { Message, MessageSchema } from '../conversations/message.schema';
import { ConversationsModule } from '../conversations/conversations.module';
import { LeadsModule } from '../leads/leads.module';
import { AiModule } from '../ai/ai.module';
import { LeadScoringService } from './lead-scoring.service';
import { ScoringController } from './scoring.controller';

/** Puntaje de leads con IA (HU70). */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: ContactActivity.name, schema: ContactActivitySchema },
      { name: Lead.name, schema: LeadSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    ConversationsModule,
    LeadsModule,
    AiModule,
  ],
  controllers: [ScoringController],
  providers: [LeadScoringService],
  exports: [LeadScoringService],
})
export class ScoringModule {}
