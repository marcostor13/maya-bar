import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { WhatsAppTemplatesController } from './whatsapp-templates.controller';
import { WhatsAppTemplatesService } from './whatsapp-templates.service';
import { WaTemplate, WaTemplateSchema } from './wa-template.schema';
import { WhatsAppAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: WaTemplate.name, schema: WaTemplateSchema },
    ]),
    WhatsAppAccountsModule,
    SharedModule,
  ],
  controllers: [WhatsAppTemplatesController],
  providers: [WhatsAppTemplatesService],
  exports: [WhatsAppTemplatesService],
})
export class WhatsAppTemplatesModule {}
