import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { WaTemplatesService } from './wa-templates.service';
import { TenantConfig, TenantConfigSchema } from './tenant-config.schema';
import { WaTemplate, WaTemplateSchema } from './wa-template.schema';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TenantConfig.name, schema: TenantConfigSchema },
      { name: WaTemplate.name, schema: WaTemplateSchema },
    ]),
    WhatsAppModule,
  ],
  controllers: [SettingsController],
  providers: [SettingsService, WaTemplatesService],
  exports: [SettingsService, WaTemplatesService],
})
export class SettingsModule {}
