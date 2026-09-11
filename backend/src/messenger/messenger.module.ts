import { Module } from '@nestjs/common';
import { MessengerService } from './messenger.service';
import { MessengerOAuthService } from './messenger-oauth.service';

@Module({
  providers: [MessengerService, MessengerOAuthService],
  exports: [MessengerService, MessengerOAuthService],
})
export class MessengerModule {}
