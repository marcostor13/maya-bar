import { Module } from '@nestjs/common';
import { InstagramService } from './instagram.service';
import { InstagramOAuthService } from './instagram-oauth.service';

@Module({
  providers: [InstagramService, InstagramOAuthService],
  exports: [InstagramService, InstagramOAuthService],
})
export class InstagramModule {}
