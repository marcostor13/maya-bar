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
import { TenantConfig, TenantConfigSchema } from '../settings/tenant-config.schema';
import { AiModule } from '../ai/ai.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: AiAgent.name, schema: AiAgentSchema },
      { name: KnowledgeDoc.name, schema: KnowledgeDocSchema },
      { name: KnowledgeChunk.name, schema: KnowledgeChunkSchema },
      { name: AgentFile.name, schema: AgentFileSchema },
      { name: TenantConfig.name, schema: TenantConfigSchema },
    ]),
    AiModule,
    WhatsAppModule,
  ],
  controllers: [AiAgentsController],
  providers: [AiAgentsService, RagService, EmbeddingsService],
  exports: [AiAgentsService],
})
export class AiAgentsModule {}
