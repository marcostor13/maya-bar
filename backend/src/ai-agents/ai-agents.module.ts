import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AiAgentsController } from './ai-agents.controller';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { InstagramWebhookController } from './instagram-webhook.controller';
import { AiAgentsService } from './ai-agents.service';
import { RagService } from './rag.service';
import { EmbeddingsService } from './embeddings.service';
import { AiAgent, AiAgentSchema } from './ai-agent.schema';
import { KnowledgeDoc, KnowledgeDocSchema } from './knowledge-doc.schema';
import { KnowledgeChunk, KnowledgeChunkSchema } from './knowledge-chunk.schema';
import {
  AgentConversation,
  AgentConversationSchema,
} from './agent-conversation.schema';
import { AgentFile, AgentFileSchema } from './agent-file.schema';
import {
  TenantConfig,
  TenantConfigSchema,
} from '../settings/tenant-config.schema';
import { AiModule } from '../ai/ai.module';
import { EMBEDDINGS_PROVIDER } from '../ai/providers/ai-provider.interface';
import { HttpEmbeddingsProvider } from '../ai/providers/http-embeddings.provider';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { WhatsAppAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';
import { InstagramModule } from '../instagram/instagram.module';
import { InstagramAccountsModule } from '../instagram-accounts/instagram-accounts.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: AiAgent.name, schema: AiAgentSchema },
      { name: KnowledgeDoc.name, schema: KnowledgeDocSchema },
      { name: KnowledgeChunk.name, schema: KnowledgeChunkSchema },
      { name: AgentConversation.name, schema: AgentConversationSchema },
      { name: AgentFile.name, schema: AgentFileSchema },
      { name: TenantConfig.name, schema: TenantConfigSchema },
    ]),
    AiModule,
    WhatsAppModule,
    WhatsAppAccountsModule,
    InstagramModule,
    InstagramAccountsModule,
  ],
  controllers: [
    AiAgentsController,
    WhatsAppWebhookController,
    InstagramWebhookController,
  ],
  providers: [
    AiAgentsService,
    RagService,
    EmbeddingsService,
    { provide: EMBEDDINGS_PROVIDER, useClass: HttpEmbeddingsProvider },
  ],
})
export class AiAgentsModule {}
