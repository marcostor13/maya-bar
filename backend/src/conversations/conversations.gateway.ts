import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * Empuja los mensajes entrantes/salientes a la bandeja de entrada en tiempo real.
 * Cada tenant tiene su propia room — el cliente se une pasando `tenantId` en la query.
 */
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/conversations' })
export class ConversationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  handleConnection(client: Socket) {
    const { tenantId } = client.handshake.query as Record<string, string>;
    if (tenantId) void client.join(tenantId);
  }

  handleDisconnect() {}

  emitMessage(tenantId: string, payload: unknown) {
    this.server?.to(tenantId).emit('message:new', payload);
  }

  emitMessageUpdated(tenantId: string, payload: unknown) {
    this.server?.to(tenantId).emit('message:updated', payload);
  }

  emitConversation(tenantId: string, payload: unknown) {
    this.server?.to(tenantId).emit('conversation:updated', payload);
  }

  /** Cambió la lista de mensajes programados de un chat (se envió uno o falló). */
  emitScheduledChanged(tenantId: string, conversationId: string) {
    this.server?.to(tenantId).emit('scheduled:changed', { conversationId });
  }

  emitTyping(tenantId: string, conversationId: string, typing: boolean) {
    this.server
      ?.to(tenantId)
      .emit('conversation:typing', { conversationId, typing });
  }
}
