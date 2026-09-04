import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ConversationsController } from './conversations.controller';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { InstagramWebhookController } from './instagram-webhook.controller';
import { ConversationsService } from './conversations.service';
import { ConversationsGateway } from './conversations.gateway';
import { HandoffService } from './handoff.service';
import { Conversation, ConversationSchema } from './conversation.schema';
import { Message, MessageSchema } from './message.schema';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { WhatsAppAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';
import { InstagramModule } from '../instagram/instagram.module';
import { InstagramAccountsModule } from '../instagram-accounts/instagram-accounts.module';
import { AiAgentsModule } from '../ai-agents/ai-agents.module';
import { UploadModule } from '../upload/upload.module';
import { LeadsModule } from '../leads/leads.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    WhatsAppModule,
    WhatsAppAccountsModule,
    InstagramModule,
    InstagramAccountsModule,
    AiAgentsModule,
    UploadModule,
    LeadsModule,
  ],
  controllers: [
    ConversationsController,
    WhatsAppWebhookController,
    InstagramWebhookController,
  ],
  providers: [ConversationsService, ConversationsGateway, HandoffService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
