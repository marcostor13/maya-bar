import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AiAgentsController } from './ai-agents.controller';
import { AiAgentsService } from './ai-agents.service';
import { RagService } from './rag.service';
import { EmbeddingsService } from './embeddings.service';
import { AiAgent, AiAgentSchema } from './ai-agent.schema';
import { KnowledgeDoc, KnowledgeDocSchema } from './knowledge-doc.schema';
import { KnowledgeChunk, KnowledgeChunkSchema } from './knowledge-chunk.schema';
import { AgentFile, AgentFileSchema } from './agent-file.schema';
import {
  TenantConfig,
  TenantConfigSchema,
} from '../settings/tenant-config.schema';
import { AiModule } from '../ai/ai.module';
import { EMBEDDINGS_PROVIDER } from '../ai/providers/ai-provider.interface';
import { HttpEmbeddingsProvider } from '../ai/providers/http-embeddings.provider';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { WooStoreService } from './store/woo-store.service';
import { LinksModule } from '../links/links.module';
import { CalendarModule } from '../calendar/calendar.module';
import {
  AgentBooking,
  AgentBookingSchema,
} from './calendar/agent-booking.schema';
import {
  AgentPromptReview,
  AgentPromptReviewSchema,
  AgentPromptVersion,
  AgentPromptVersionSchema,
} from './insights/prompt-insights.schemas';
import {
  Conversation,
  ConversationSchema,
} from '../conversations/conversation.schema';
import { Message, MessageSchema } from '../conversations/message.schema';
import { PromptVersionsService } from './insights/prompt-versions.service';
import { PromptReviewService } from './insights/prompt-review.service';
import { AgentGeneratorService } from './insights/agent-generator.service';
import { AgentInsightsController } from './insights/agent-insights.controller';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: AiAgent.name, schema: AiAgentSchema },
      { name: KnowledgeDoc.name, schema: KnowledgeDocSchema },
      { name: KnowledgeChunk.name, schema: KnowledgeChunkSchema },
      { name: AgentFile.name, schema: AgentFileSchema },
      { name: TenantConfig.name, schema: TenantConfigSchema },
      { name: AgentBooking.name, schema: AgentBookingSchema },
      { name: AgentPromptVersion.name, schema: AgentPromptVersionSchema },
      { name: AgentPromptReview.name, schema: AgentPromptReviewSchema },
      // Solo lectura, para analizar lo que respondió cada agente (HU8).
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    AiModule,
    WhatsAppModule,
    LinksModule,
    CalendarModule,
  ],
  // Los webhooks de WhatsApp/Instagram viven ahora en ConversationsModule:
  // así el módulo de agentes no depende de las conversaciones (evita el ciclo).
  controllers: [AiAgentsController, AgentInsightsController],
  providers: [
    AiAgentsService,
    RagService,
    EmbeddingsService,
    WooStoreService,
    PromptVersionsService,
    PromptReviewService,
    AgentGeneratorService,
    { provide: EMBEDDINGS_PROVIDER, useClass: HttpEmbeddingsProvider },
  ],
  exports: [AiAgentsService],
})
export class AiAgentsModule {}
