import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import {
  Conversation,
  ConversationSchema,
} from '../conversations/conversation.schema';
import { Message, MessageSchema } from '../conversations/message.schema';
import { AiAgent, AiAgentSchema } from '../ai-agents/ai-agent.schema';
import { LeadsModule } from '../leads/leads.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: AiAgent.name, schema: AiAgentSchema },
    ]),
    // El bloque de seguimiento reutiliza las métricas del tablero de leads en
    // vez de recalcularlas: son las mismas y deben cuadrar entre pantallas.
    LeadsModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
