import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { Campaign, CampaignSchema } from './campaign.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { MailModule } from '../mail/mail.module';
import { SettingsModule } from '../settings/settings.module';
import { ListsModule } from '../lists/lists.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Campaign.name, schema: CampaignSchema },
      { name: Customer.name, schema: CustomerSchema },
    ]),
    MailModule,
    SettingsModule,
    ListsModule,
    AiModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
