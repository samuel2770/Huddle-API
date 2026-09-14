import { Module } from '@nestjs/common';
import { ChatEventsService } from './chat-events.service.js';

@Module({
  providers: [ChatEventsService],
  exports: [ChatEventsService],
})
export class ChatEventsModule {}
