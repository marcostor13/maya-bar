import { CampaignAttributionModule } from '../campaign-attribution/campaign-attribution.module';
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
import { ConversationAssignmentService } from './conversation-assignment.service';
import { User, UserSchema } from '../users/user.schema';
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
import { MailModule } from '../mail/mail.module';
import { SmsModule } from '../sms/sms.module';
import { AuthModule } from '../auth/auth.module';
import { Call, CallSchema } from '../calls/call.schema';
import {
  CallPermission,
  CallPermissionSchema,
} from '../calls/call-permission.schema';
import { CallsService } from '../calls/calls.service';
import { CallsMetaService } from '../calls/calls-meta.service';
import { CallsController } from '../calls/calls.controller';
import { BlockedContact, BlockedContactSchema } from './blocked-contact.schema';
import { BlockedContactsService } from './blocked-contacts.service';
import { ConversationTrashService } from './conversation-trash.service';
import { Lead, LeadSchema } from '../leads/lead.schema';
import {
  ContactActivity,
  ContactActivitySchema,
} from '../customers/contact-activity.schema';
import {
  AgentBooking,
  AgentBookingSchema,
} from '../ai-agents/calendar/agent-booking.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: ScheduledMessage.name, schema: ScheduledMessageSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: User.name, schema: UserSchema },
      { name: BlockedContact.name, schema: BlockedContactSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: ContactActivity.name, schema: ContactActivitySchema },
      { name: AgentBooking.name, schema: AgentBookingSchema },
      { name: Call.name, schema: CallSchema },
      { name: CallPermission.name, schema: CallPermissionSchema },
    ]),
    WhatsAppModule,
    WhatsAppAccountsModule,
    InstagramModule,
    InstagramAccountsModule,
    MessengerModule,
    MessengerAccountsModule,
    AiAgentsModule,
    CampaignAttributionModule,
    AiModule,
    UploadModule,
    LeadsModule,
    EmailAccountsModule,
    MailModule,
    SmsModule,
    // ActiveUserCache: el socket comprueba que la sesión siga viva.
    AuthModule,
  ],
  controllers: [
    ConversationsController,
    WhatsAppWebhookController,
    InstagramWebhookController,
    MessengerWebhookController,
    CallsController,
  ],
  providers: [
    ConversationsService,
    ConversationsGateway,
    HandoffService,
    ConversationAssignmentService,
    EmailListenerService,
    InboxToolsService,
    BlockedContactsService,
    ConversationTrashService,
    // Llamadas (HU6): viven aquí porque el webhook de WhatsApp las despacha.
    CallsService,
    CallsMetaService,
  ],
  exports: [ConversationsService, BlockedContactsService],
})
export class ConversationsModule {}
