import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Tenant, TenantSchema } from '../tenants/tenant.schema';
import { User, UserSchema } from '../users/user.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import {
  Conversation,
  ConversationSchema,
} from '../conversations/conversation.schema';
import { Message, MessageSchema } from '../conversations/message.schema';
import {
  WhatsAppAccount,
  WhatsAppAccountSchema,
} from '../whatsapp-accounts/whatsapp-account.schema';
import { AiAgent, AiAgentSchema } from '../ai-agents/ai-agent.schema';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Tenant.name, schema: TenantSchema },
      { name: User.name, schema: UserSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: WhatsAppAccount.name, schema: WhatsAppAccountSchema },
      { name: AiAgent.name, schema: AiAgentSchema },
    ]),
  ],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
