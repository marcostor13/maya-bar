import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { ActiveUserCache } from '../auth/active-user.cache';
import { RolesService } from '../roles/roles.service';

interface TokenPayload {
  sub: string;
  role: string;
  tenantId?: string;
  iat?: number;
  iatMs?: number;
}

/** Salas: todo se deriva del JWT, nunca de lo que mande el cliente. */
export const tenantRoom = (tenantId: string) => `tenant:${tenantId}`;
export const userRoom = (userId: string) => `user:${userId}`;
export const callsRoom = (tenantId: string) => `calls:${tenantId}`;

/**
 * Tiempo real de la bandeja y de las llamadas.
 *
 * El cliente se identifica con su access token (`auth.token` en el handshake).
 * Antes bastaba con mandar un `tenantId` en la query: cualquiera que lo
 * conociera escuchaba los chats de esa empresa.
 */
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/conversations' })
export class ConversationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ConversationsGateway.name);
  private readonly jwt: JwtService;

  constructor(
    config: ConfigService,
    private activeUsers: ActiveUserCache,
    private roles: RolesService,
  ) {
    this.jwt = new JwtService({
      secret: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async handleConnection(client: Socket) {
    const payload = await this.authenticate(client);
    if (!payload?.tenantId) {
      client.disconnect(true);
      return;
    }
    const { sub: userId, tenantId, role } = payload;
    client.data = { userId, tenantId, role };
    const rooms = [tenantRoom(tenantId), userRoom(userId)];
    if (await this.canUseCalls(tenantId, role)) rooms.push(callsRoom(tenantId));
    await client.join(rooms);
  }

  handleDisconnect() {}

  private async authenticate(client: Socket): Promise<TokenPayload | null> {
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    const token = typeof auth?.token === 'string' ? auth.token : undefined;
    if (!token) return null;
    try {
      const payload = await this.jwt.verifyAsync<TokenPayload>(token);
      const issuedAtMs =
        payload.iatMs ??
        (payload.iat !== undefined ? payload.iat * 1000 + 999 : undefined);
      const state = await this.activeUsers.check(payload.sub, issuedAtMs);
      return state === 'ok' ? payload : null;
    } catch {
      return null;
    }
  }

  private async canUseCalls(tenantId: string, role: string): Promise<boolean> {
    try {
      return (await this.roles.modulesFor(tenantId, role)).includes('calls');
    } catch (err) {
      this.logger.warn(
        `No se pudieron leer los módulos del rol: ${String(err)}`,
      );
      return false;
    }
  }

  emitMessage(tenantId: string, payload: unknown) {
    this.server?.to(tenantRoom(tenantId)).emit('message:new', payload);
  }

  emitMessageUpdated(tenantId: string, payload: unknown) {
    this.server?.to(tenantRoom(tenantId)).emit('message:updated', payload);
  }

  emitConversation(tenantId: string, payload: unknown) {
    this.server?.to(tenantRoom(tenantId)).emit('conversation:updated', payload);
  }

  /** Conversaciones que salieron de la bandeja (papelera). */
  emitRemoved(tenantId: string, ids: string[]) {
    if (ids.length)
      this.server
        ?.to(tenantRoom(tenantId))
        .emit('conversation:removed', { ids });
  }

  /** Cambió la lista de mensajes programados de un chat (se envió uno o falló). */
  emitScheduledChanged(tenantId: string, conversationId: string) {
    this.server
      ?.to(tenantRoom(tenantId))
      .emit('scheduled:changed', { conversationId });
  }

  emitTyping(tenantId: string, conversationId: string, typing: boolean) {
    this.server
      ?.to(tenantRoom(tenantId))
      .emit('conversation:typing', { conversationId, typing });
  }

  /** Solo a quienes tienen el módulo Llamadas en esa empresa. */
  emitToCalls(tenantId: string, event: string, payload: unknown) {
    this.server?.to(callsRoom(tenantId)).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(userRoom(userId)).emit(event, payload);
  }
}
