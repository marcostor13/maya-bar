import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WhatsAppAccountsController } from './whatsapp-accounts.controller';
import { WhatsAppAccountsService } from './whatsapp-accounts.service';
import {
  WhatsAppAccount,
  WhatsAppAccountSchema,
} from './whatsapp-account.schema';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WhatsAppAccount.name, schema: WhatsAppAccountSchema },
    ]),
    WhatsAppModule,
  ],
  controllers: [WhatsAppAccountsController],
  providers: [WhatsAppAccountsService],
  exports: [WhatsAppAccountsService, MongooseModule],
})
export class WhatsAppAccountsModule {}
