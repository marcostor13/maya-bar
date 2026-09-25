import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ConversationsController } from './conversations.controller';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { InstagramWebhookController } from './instagram-webhook.controller';
import { MessengerWebhookController } from './messenger-webhook.controller';
import { ConversationsService } from './conversations.service';
import { ConversationsGateway } from './conversations.gateway';
import { HandoffService } from './handoff.service';
import { Conversation, ConversationSchema } from './conversation.schema';
import { Message, MessageSchema } from './message.schema';
import {
  ScheduledMessage,
  ScheduledMessageSchema,
} from './scheduled-message.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { InboxToolsService } from './inbox-tools.service';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { WhatsAppAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';
import { InstagramModule } from '../instagram/instagram.module';
import { InstagramAccountsModule } from '../instagram-accounts/instagram-accounts.module';
import { MessengerModule } from '../messenger/messenger.module';
import { MessengerAccountsModule } from '../messenger-accounts/messenger-accounts.module';
import { AiAgentsModule } from '../ai-agents/ai-agents.module';
import { AiModule } from '../ai/ai.module';
import { UploadModule } from '../upload/upload.module';
import { LeadsModule } from '../leads/leads.module';
import { EmailAccountsModule } from '../email-accounts/email-accounts.module';
import { EmailListenerService } from './email-listener.service';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: ScheduledMessage.name, schema: ScheduledMessageSchema },
      { name: Customer.name, schema: CustomerSchema },
    ]),
    WhatsAppModule,
    WhatsAppAccountsModule,
    InstagramModule,
    InstagramAccountsModule,
    MessengerModule,
    MessengerAccountsModule,
    AiAgentsModule,
    AiModule,
    UploadModule,
    LeadsModule,
    EmailAccountsModule,
  ],
  controllers: [
    ConversationsController,
    WhatsAppWebhookController,
    InstagramWebhookController,
    MessengerWebhookController,
  ],
  providers: [
    ConversationsService,
    ConversationsGateway,
    HandoffService,
    EmailListenerService,
    InboxToolsService,
  ],
  exports: [ConversationsService],
})
export class ConversationsModule {}
