import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InstagramAccountsController } from './instagram-accounts.controller';
import { InstagramOAuthCallbackController } from './instagram-oauth-callback.controller';
import { InstagramAccountsService } from './instagram-accounts.service';
import { InstagramAccount, InstagramAccountSchema } from './instagram-account.schema';
import { InstagramModule } from '../instagram/instagram.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InstagramAccount.name, schema: InstagramAccountSchema },
    ]),
    InstagramModule,
  ],
  controllers: [InstagramAccountsController, InstagramOAuthCallbackController],
  providers: [InstagramAccountsService],
  exports: [InstagramAccountsService, MongooseModule],
})
export class InstagramAccountsModule {}
