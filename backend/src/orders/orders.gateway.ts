import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/orders' })
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  handleConnection(client: Socket) {
    const { tenantId, localId } = client.handshake.query as Record<
      string,
      string
    >;
    if (tenantId && localId) {
      void client.join(`${tenantId}:${localId}`);
    } else if (tenantId) {
      void client.join(tenantId);
    }
  }

  handleDisconnect() {}

  emitOrderNew(tenantId: string, localId: string, order: unknown) {
    this.server.to(`${tenantId}:${localId}`).emit('order:new', order);
  }

  emitOrderUpdated(tenantId: string, localId: string, order: unknown) {
    this.server.to(`${tenantId}:${localId}`).emit('order:updated', order);
  }
}
