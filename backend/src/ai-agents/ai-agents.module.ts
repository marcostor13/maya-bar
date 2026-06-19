import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AiAgentsController } from './ai-agents.controller';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { AiAgentsService } from './ai-agents.service';
import { RagService } from './rag.service';
import { EmbeddingsService } from './embeddings.service';
import { AiAgent, AiAgentSchema } from './ai-agent.schema';
import { KnowledgeDoc, KnowledgeDocSchema } from './knowledge-doc.schema';
import { KnowledgeChunk, KnowledgeChunkSchema } from './knowledge-chunk.schema';
import { AgentConversation, AgentConversationSchema } from './agent-conversation.schema';
import { AgentFile, AgentFileSchema } from './agent-file.schema';
import { AiModule } from '../ai/ai.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { WhatsAppAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: AiAgent.name, schema: AiAgentSchema },
      { name: KnowledgeDoc.name, schema: KnowledgeDocSchema },
      { name: KnowledgeChunk.name, schema: KnowledgeChunkSchema },
      { name: AgentConversation.name, schema: AgentConversationSchema },
      { name: AgentFile.name, schema: AgentFileSchema },
    ]),
    AiModule,
    WhatsAppModule,
    WhatsAppAccountsModule,
  ],
  controllers: [AiAgentsController, WhatsAppWebhookController],
  providers: [AiAgentsService, RagService, EmbeddingsService],
})
export class AiAgentsModule {}
