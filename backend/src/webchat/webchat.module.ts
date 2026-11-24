import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Tenant, TenantSchema } from '../tenants/tenant.schema';
import {
  Conversation,
  ConversationSchema,
} from '../conversations/conversation.schema';
import { ConversationsModule } from '../conversations/conversations.module';
import { WebWidget, WebWidgetSchema } from './web-widget.schema';
import { WebchatService } from './webchat.service';
import { WebchatController } from './webchat.controller';

/** Chat web embebible en el sitio de la empresa (HU69). */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WebWidget.name, schema: WebWidgetSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: Conversation.name, schema: ConversationSchema },
    ]),
    ConversationsModule,
  ],
  controllers: [WebchatController],
  providers: [WebchatService],
})
export class WebchatModule {}
