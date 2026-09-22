import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';
import { MediaUnderstandingService } from './media-understanding.service';
import { AI_CHAT_PROVIDER } from './providers/ai-provider.interface';
import { HttpAiProvider } from './providers/http-ai.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    AiService,
    MediaUnderstandingService,
    { provide: AI_CHAT_PROVIDER, useClass: HttpAiProvider },
  ],
  exports: [AiService, MediaUnderstandingService, AI_CHAT_PROVIDER],
})
export class AiModule {}
