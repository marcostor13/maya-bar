import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AiService } from './ai.service';
import { MediaUnderstandingService } from './media-understanding.service';
import { AI_CHAT_PROVIDER } from './providers/ai-provider.interface';
import { HttpAiProvider } from './providers/http-ai.provider';
import { PlatformAiController } from './platform-ai/platform-ai.controller';
import {
  PlatformAiSettings,
  PlatformAiSettingsSchema,
} from './platform-ai/platform-ai.schema';
import { PlatformAiService } from './platform-ai/platform-ai.service';
import {
  TenantConfig,
  TenantConfigSchema,
} from '../settings/tenant-config.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: PlatformAiSettings.name, schema: PlatformAiSettingsSchema },
      // Keys propias de la empresa para las llamadas sin `apiKeys` (HU85).
      { name: TenantConfig.name, schema: TenantConfigSchema },
    ]),
  ],
  controllers: [PlatformAiController],
  providers: [
    AiService,
    MediaUnderstandingService,
    PlatformAiService,
    { provide: AI_CHAT_PROVIDER, useClass: HttpAiProvider },
  ],
  exports: [
    AiService,
    MediaUnderstandingService,
    PlatformAiService,
    AI_CHAT_PROVIDER,
  ],
})
export class AiModule {}
