import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConversationsModule } from '../conversations/conversations.module';
import {
  Conversation,
  ConversationSchema,
} from '../conversations/conversation.schema';
import { Message, MessageSchema } from '../conversations/message.schema';
import { WhatsAppAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';
import { InstagramAccountsModule } from '../instagram-accounts/instagram-accounts.module';
import { MessengerAccountsModule } from '../messenger-accounts/messenger-accounts.module';
import {
  WaTemplate,
  WaTemplateSchema,
} from '../whatsapp-templates/wa-template.schema';
import { RolesModule } from '../roles/roles.module';
import { SmsModule } from '../sms/sms.module';
import { TenantsModule } from '../tenants/tenants.module';
import { LeadsModule } from '../leads/leads.module';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import { Event, EventSchema } from '../events/event.schema';
import { ContactForm, ContactFormSchema } from '../forms/form.schema';
import { ApiHook, ApiHookSchema, ApiHooksService } from './api-hooks.service';
import { ApiCrmService } from './api-crm.service';
import {
  ApiCrmController,
  ApiDocsController,
  AutomationKeyGuard,
} from './api-crm.controller';
import {
  ApiAccess,
  ApiAccessSchema,
  ApiUsage,
  ApiUsageSchema,
  ApiSmsMessage,
  ApiSmsMessageSchema,
  ApiWebhookDelivery,
  ApiWebhookDeliverySchema,
} from './api-access.schema';
import { ApiWebhookService } from './api-webhook.service';
import { ApiSmsService } from './api-sms.service';
import { ApiAccessService } from './api-access.service';
import { ApiMessagesService } from './api-messages.service';
import { ApiKeyGuard } from './api-key.guard';
import { ApiAccessController } from './api-access.controller';
import { PublicApiController } from './public-api.controller';

/** Integraciones (HU13): claves de API para enviar mensajes por una cuenta. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ApiAccess.name, schema: ApiAccessSchema },
      { name: ApiUsage.name, schema: ApiUsageSchema },
      { name: ApiSmsMessage.name, schema: ApiSmsMessageSchema },
      { name: ApiWebhookDelivery.name, schema: ApiWebhookDeliverySchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: WaTemplate.name, schema: WaTemplateSchema },
      { name: ApiHook.name, schema: ApiHookSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: Event.name, schema: EventSchema },
      { name: ContactForm.name, schema: ContactFormSchema },
    ]),
    ConversationsModule,
    WhatsAppAccountsModule,
    InstagramAccountsModule,
    MessengerAccountsModule,
    RolesModule,
    SmsModule,
    TenantsModule,
    LeadsModule,
  ],
  controllers: [
    ApiAccessController,
    PublicApiController,
    ApiDocsController,
    ApiCrmController,
  ],
  providers: [
    ApiAccessService,
    ApiMessagesService,
    ApiSmsService,
    ApiWebhookService,
    ApiKeyGuard,
    AutomationKeyGuard,
    ApiHooksService,
    ApiCrmService,
  ],
})
export class ApiAccessModule {}
