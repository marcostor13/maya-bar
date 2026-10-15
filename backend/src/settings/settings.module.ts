import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { TenantConfig, TenantConfigSchema } from './tenant-config.schema';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { WhatsAppAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';
import {
  WaTemplate,
  WaTemplateSchema,
} from '../whatsapp-templates/wa-template.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TenantConfig.name, schema: TenantConfigSchema },
      { name: WaTemplate.name, schema: WaTemplateSchema },
    ]),
    WhatsAppModule,
    WhatsAppAccountsModule,
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
