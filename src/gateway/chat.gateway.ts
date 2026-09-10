import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { MessagesService } from '../messages/messages.service.js';
import { CreateMessageDto } from '../messages/dto/create-message.dto.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Track which users are connected (userId -> Set<socketId>)
  private connectedUsers = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly messagesService: MessagesService,
    @InjectRepository(ChannelMember)
    private readonly memberRepository: Repository<ChannelMember>,
  ) {}

  /**
   * JWT auth middleware on WebSocket connection.
   * Per spec: "Socket.io auth middleware validating the JWT on connection"
   */
  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const token =
        client.handshake.auth?.token ??
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.emit('error', { message: 'Authentication required' });
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret:
          process.env.JWT_ACCESS_SECRET ??
          'your-access-secret-change-in-production',
      });

      if (!payload.sub || !payload.email) {
        client.emit('error', { message: 'Invalid token payload' });
        client.disconnect();
        return;
      }

      client.userId = payload.sub;
      client.email = payload.email;

      // Track this connection
      if (!this.connectedUsers.has(client.userId)) {
        this.connectedUsers.set(client.userId, new Set());
      }
      this.connectedUsers.get(client.userId)!.add(client.id);

      // Emit presence event
      this.server.emit('user:online', { userId: client.userId });

      client.emit('connected', {
        message: 'Connected to chat gateway',
        userId: client.userId,
      });
    } catch {
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
          // Only emit offline when ALL sockets for this user are gone
          this.server.emit('user:offline', { userId: client.userId });
        }
      }
    }
  }

  /**
   * Join a channel room. Per spec: "a user shouldn't receive events
   * for channels they're not a member of" — enforced by membership check.
   */
  @SubscribeMessage('channel:join')
  async handleJoinChannel(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { channelId: string },
  ): Promise<{ success: boolean; channelId: string }> {
    if (!client.userId) {
      throw new WsException('Not authenticated');
    }

    // Verify membership before allowing room join
    const membership = await this.memberRepository.findOne({
      where: {
        channel_id: data.channelId,
        user_id: client.userId,
      },
    });

    if (!membership) {
      throw new WsException('You are not a member of this channel');
    }

    await client.join(`channel:${data.channelId}`);
    return { success: true, channelId: data.channelId };
  }

  @SubscribeMessage('channel:leave')
  async handleLeaveChannel(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { channelId: string },
  ): Promise<{ success: boolean; channelId: string }> {
    await client.leave(`channel:${data.channelId}`);
    return { success: true, channelId: data.channelId };
  }

  /**
   * Send a message via socket. Per spec: "must emit an acknowledgment
   * or error back to the sender so the frontend can distinguish
   * success from failure"
   */
  @SubscribeMessage('message:send')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: { channelId: string; content?: string; replyToMessageId?: string },
  ): Promise<{ success: boolean; message?: any; error?: string }> {
    if (!client.userId) {
      throw new WsException('Not authenticated');
    }

    try {
      const dto = new CreateMessageDto();
      dto.content = data.content;
      dto.replyToMessageId = data.replyToMessageId;

      const message = await this.messagesService.create(
        data.channelId,
        client.userId,
        dto,
      );

      // Broadcast to all OTHER clients in the channel room
      client
        .to(`channel:${data.channelId}`)
        .emit('message:new', { message, channelId: data.channelId });

      // Return ack to sender
      return { success: true, message };
    } catch (error: any) {
      return {
        success: false,
        error: error.message ?? 'Failed to send message',
      };
    }
  }

  /**
   * Typing indicators — per spec: "if typing indicators are in scope"
   */
  @SubscribeMessage('typing:start')
  async handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { channelId: string },
  ): Promise<void> {
    if (!client.userId) return;
    client.to(`channel:${data.channelId}`).emit('typing:start', {
      userId: client.userId,
      channelId: data.channelId,
    });
  }

  @SubscribeMessage('typing:stop')
  async handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { channelId: string },
  ): Promise<void> {
    if (!client.userId) return;
    client.to(`channel:${data.channelId}`).emit('typing:stop', {
      userId: client.userId,
      channelId: data.channelId,
    });
  }

  /**
   * Read receipt event
   */
  @SubscribeMessage('message:read')
  async handleMessageRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { channelId: string; messageId: string },
  ): Promise<{ success: boolean }> {
    if (!client.userId) {
      throw new WsException('Not authenticated');
    }

    try {
      await this.messagesService.markRead(
        data.channelId,
        data.messageId,
        client.userId,
      );

      client.to(`channel:${data.channelId}`).emit('message:read', {
        userId: client.userId,
        channelId: data.channelId,
        messageId: data.messageId,
      });

      return { success: true };
    } catch {
      return { success: false };
    }
  }

  /**
   * Helper: check if a user is currently online
   */
  isUserOnline(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  /**
   * Helper: get all online user IDs
   */
  getOnlineUserIds(): string[] {
    return Array.from(this.connectedUsers.keys());
  }
}
