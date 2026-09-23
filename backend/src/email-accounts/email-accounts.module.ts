import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailAccount, EmailAccountSchema } from './email-account.schema';
import { EmailAccountsService } from './email-accounts.service';
import { EmailOAuthService } from './email-oauth.service';
import { EmailTransportService } from './email-transport.service';
import {
  EmailAccountsController,
  EmailOAuthCallbackController,
} from './email-accounts.controller';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: EmailAccount.name, schema: EmailAccountSchema },
    ]),
  ],
  // El callback va primero: `oauth/:provider/callback` no debe caer en `:id`.
  controllers: [EmailOAuthCallbackController, EmailAccountsController],
  providers: [EmailAccountsService, EmailOAuthService, EmailTransportService],
  exports: [EmailAccountsService, EmailTransportService],
})
export class EmailAccountsModule {}
