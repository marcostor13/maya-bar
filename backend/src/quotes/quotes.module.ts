import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import {
  LeadActivity,
  LeadActivitySchema,
} from '../leads/lead-activity.schema';
import { LeadsModule } from '../leads/leads.module';
import { Tenant, TenantSchema } from '../tenants/tenant.schema';
import {
  WhatsAppAccount,
  WhatsAppAccountSchema,
} from '../whatsapp-accounts/whatsapp-account.schema';
import {
  Conversation,
  ConversationSchema,
} from '../conversations/conversation.schema';
import { Message, MessageSchema } from '../conversations/message.schema';
import { ConversationsModule } from '../conversations/conversations.module';
import { MailModule } from '../mail/mail.module';
import { EventTicketsModule } from '../event-tickets/event-tickets.module';
import { WooStoreService } from '../ai-agents/store/woo-store.service';
import { Product, ProductSchema } from './product.schema';
import { Quote, QuoteSchema } from './quote.schema';
import { QuotesService } from './quotes.service';
import { QuotesController } from './quotes.controller';

/** Cotizaciones desde la oportunidad (HU68). */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Quote.name, schema: QuoteSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: LeadActivity.name, schema: LeadActivitySchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: WhatsAppAccount.name, schema: WhatsAppAccountSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    LeadsModule,
    ConversationsModule,
    MailModule,
    EventTicketsModule,
  ],
  controllers: [QuotesController],
  providers: [QuotesService, WooStoreService],
})
export class QuotesModule {}
