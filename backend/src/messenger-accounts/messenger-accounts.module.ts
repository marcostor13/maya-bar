import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MessengerAccountsController } from './messenger-accounts.controller';
import { MessengerOAuthCallbackController } from './messenger-oauth-callback.controller';
import { MessengerAccountsService } from './messenger-accounts.service';
import {
  MessengerAccount,
  MessengerAccountSchema,
} from './messenger-account.schema';
import { MessengerModule } from '../messenger/messenger.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MessengerAccount.name, schema: MessengerAccountSchema },
    ]),
    MessengerModule,
  ],
  controllers: [MessengerAccountsController, MessengerOAuthCallbackController],
  providers: [MessengerAccountsService],
  exports: [MessengerAccountsService, MongooseModule],
})
export class MessengerAccountsModule {}
