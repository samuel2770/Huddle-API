import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway.js';
import { AuthModule } from '../auth/auth.module.js';
import { ChatEventsModule } from './chat-events.module.js';

@Module({
  imports: [
    ChatEventsModule,
    AuthModule,
  ],
  providers: [ChatGateway],
  exports: [ChatGateway],
})
export class GatewayModule {}
