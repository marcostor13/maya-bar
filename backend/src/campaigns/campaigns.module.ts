import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { Campaign, CampaignSchema } from './campaign.schema';
import { WhatsAppTemplatesModule } from '../whatsapp-templates/whatsapp-templates.module';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { MailModule } from '../mail/mail.module';
import { SettingsModule } from '../settings/settings.module';
import { ListsModule } from '../lists/lists.module';
import { AiModule } from '../ai/ai.module';
import {
  CampaignRecipient,
  CampaignRecipientSchema,
} from './campaign-recipient.schema';
import { CampaignSenderService } from './campaign-sender.service';
import { UnsubscribeController } from './unsubscribe.controller';
import {
  EmailTemplate,
  EmailTemplateSchema,
} from '../email-templates/email-template.schema';
import { Tenant, TenantSchema } from '../tenants/tenant.schema';
import { EmailAccountsModule } from '../email-accounts/email-accounts.module';
import { SmsModule } from '../sms/sms.module';
import { LinksModule } from '../links/links.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Campaign.name, schema: CampaignSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: CampaignRecipient.name, schema: CampaignRecipientSchema },
      { name: EmailTemplate.name, schema: EmailTemplateSchema },
      { name: Tenant.name, schema: TenantSchema },
    ]),
    WhatsAppTemplatesModule,
    MailModule,
    SettingsModule,
    ListsModule,
    AiModule,
    EmailAccountsModule,
    SmsModule,
    LinksModule,
  ],
  controllers: [CampaignsController, UnsubscribeController],
  providers: [CampaignsService, CampaignSenderService],
})
export class CampaignsModule {}
