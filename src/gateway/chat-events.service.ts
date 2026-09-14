import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

@Injectable()
export class ChatEventsService {
  private server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
  }

  broadcastToChannel(channelId: string, event: string, payload: any): void {
    if (this.server) {
      this.server.to(`channel:${channelId}`).emit(event, payload);
    }
  }

  broadcastToUser(userId: string, event: string, payload: any): void {
    if (this.server) {
      this.server.to(`user:${userId}`).emit(event, payload);
    }
  }
}
