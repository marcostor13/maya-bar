import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppOAuthService } from './whatsapp-oauth.service';

@Module({
  providers: [WhatsAppService, WhatsAppOAuthService],
  exports: [WhatsAppService, WhatsAppOAuthService],
})
export class WhatsAppModule {}
