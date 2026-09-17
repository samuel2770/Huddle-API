import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { ChatEventsService } from './chat-events.service.js';
import { Channel, ChannelType } from '../channels/entities/channel.entity.js';
import { ChannelMember } from '../channels/entities/channel-member.entity.js';

interface AuthenticatedSocket extends Socket {
  userId: string;
  email: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/chat',
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private connectedUsers = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatEventsService: ChatEventsService,
    private readonly dataSource: DataSource,
  ) {}

  afterInit(server: Server): void {
    this.chatEventsService.setServer(server);
    console.log('[ChatGateway] WebSocket server initialized on /chat namespace');
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const token =
        client.handshake.auth?.token ??
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        console.warn(`[ChatGateway] Client ${client.id} rejected: No JWT token`);
        client.emit('error', { message: 'Authentication required' });
        client.disconnect();
        return;
      }

      const secret =
        process.env.JWT_ACCESS_SECRET ??
        'dev-only-jwt-secret-not-for-production-min32chars';
      const payload = this.jwtService.verify(token, { secret });

      if (!payload.sub || !payload.email) {
        console.warn(
          `[ChatGateway] Client ${client.id} rejected: Invalid token payload`,
        );
        client.emit('error', { message: 'Invalid token payload' });
        client.disconnect();
        return;
      }

      client.userId = payload.sub;
      client.email = payload.email;

      if (!this.connectedUsers.has(client.userId)) {
        this.connectedUsers.set(client.userId, new Set());
      }
      this.connectedUsers.get(client.userId)!.add(client.id);

      await client.join(`user:${client.userId}`);

      console.log(
        `[ChatGateway] Client connected & authenticated: user=${client.userId}, socketId=${client.id}`,
      );

      this.server.emit('user:online', { userId: client.userId });

      client.emit('connected', {
        message: 'Connected to chat gateway',
        userId: client.userId,
        onlineUserIds: Array.from(this.connectedUsers.keys()),
      });
    } catch (err: any) {
      console.warn(
        `[ChatGateway] Auth failed for client ${client.id}:`,
        err?.message,
      );
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    if (client.userId) {
      const userSockets = this.connectedUsers.get(client.userId);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.connectedUsers.delete(client.userId);
          this.server.emit('user:offline', { userId: client.userId });
        }
      }
      console.log(
        `[ChatGateway] Client disconnected: user=${client.userId}, socketId=${client.id}`,
      );
    }
  }

  @SubscribeMessage('channel:join')
  async handleJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: any,
  ) {
    const channelId =
      typeof payload === 'string'
        ? payload
        : payload?.channelId || payload?.id;

    if (!channelId) {
      return { success: false, error: 'channelId is required' };
    }

    try {
      const channelRepo = this.dataSource.getRepository(Channel);
      const channel = await channelRepo.findOne({ where: { id: channelId } });
      if (!channel) {
        return { success: false, error: 'Channel not found' };
      }

      if (channel.type === ChannelType.DM || channel.type === ChannelType.PRIVATE) {
        const memberRepo = this.dataSource.getRepository(ChannelMember);
        const isMember = await memberRepo.findOne({
          where: { channel_id: channelId, user_id: client.userId },
        });
        if (!isMember) {
          console.warn(
            `[ChatGateway] Unauthorized join attempt to private/DM channel ${channelId} by user ${client.userId}`,
          );
          return {
            success: false,
            error: 'Access denied: You are not a member of this conversation',
          };
        }
      }
    } catch (err: any) {
      console.error('[ChatGateway] Error verifying channel membership on join:', err?.message);
    }

    const roomName = `channel:${channelId}`;
    await client.join(roomName);

    const adapter: any = this.server?.sockets?.adapter;
    const room = adapter?.rooms?.get(roomName);
    const memberCount = room ? room.size : 1;
    console.log(
      `[ChatGateway] Client ${client.id} (user: ${client.userId}) joined room ${roomName} | Total in room: ${memberCount}`,
    );

    return { success: true, channelId, memberCount };
  }

  @SubscribeMessage('channel:leave')
  async handleLeave(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: any,
  ) {
    const channelId =
      typeof payload === 'string'
        ? payload
        : payload?.channelId || payload?.id;

    if (!channelId) {
      return { success: false, error: 'channelId is required' };
    }

    const roomName = `channel:${channelId}`;
    await client.leave(roomName);

    const adapter: any = this.server?.sockets?.adapter;
    const room = adapter?.rooms?.get(roomName);
    const memberCount = room ? room.size : 0;
    console.log(
      `[ChatGateway] Client ${client.id} (user: ${client.userId}) left room ${roomName} | Total in room: ${memberCount}`,
    );

    return { success: true, channelId };
  }

  @SubscribeMessage('typing:start')
  handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: any,
  ) {
    const channelId =
      typeof payload === 'string' ? payload : payload?.channelId;
    if (channelId && client.userId) {
      client.to(`channel:${channelId}`).emit('typing:start', {
        userId: client.userId,
        channelId,
      });
    }
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: any,
  ) {
    const channelId =
      typeof payload === 'string' ? payload : payload?.channelId;
    if (channelId && client.userId) {
      client.to(`channel:${channelId}`).emit('typing:stop', {
        userId: client.userId,
        channelId,
      });
    }
  }
}
