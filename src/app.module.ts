import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ChannelsModule } from './channels/channels.module.js';
import { MessagesModule } from './messages/messages.module.js';
import { UsersModule } from './users/users.module.js';
import { WorkspacesModule } from './workspaces/workspaces.module.js';
import { CommonModule } from './common/common.module.js';
import { AuthModule } from './auth/auth.module.js';
import { GatewayModule } from './gateway/gateway.module.js';
import { RedisModule } from './redis/redis.module.js';
import { InvitesModule } from './invites/invites.module.js';
import { MailModule } from './mail/mail.module.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { User } from './users/entities/user.entity.js';
import { Workspace } from './workspaces/entities/workspace.entity.js';
import { Channel } from './channels/entities/channel.entity.js';
import { ChannelMember } from './channels/entities/channel-member.entity.js';
import { Message } from './messages/entities/message.entity.js';
import { Attachment } from './messages/entities/attachment.entity.js';
import { RefreshToken } from './auth/entities/refresh-token.entity.js';
import { PasswordResetToken } from './auth/entities/password-reset-token.entity.js';
import { WorkspaceMember } from './workspaces/entities/workspace-member.entity.js';
import { Invite } from './invites/entities/invite.entity.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USERNAME ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      database: process.env.DB_DATABASE ?? 'huddle',
      entities: [
        User,
        Workspace,
        Channel,
        ChannelMember,
        Message,
        Attachment,
        RefreshToken,
        PasswordResetToken,
        WorkspaceMember,
        Invite,
      ],
      autoLoadEntities: true,
      synchronize: process.env.DB_SYNCHRONIZE !== 'false',
      logging: process.env.DB_LOGGING === 'true',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
        limit: parseInt(process.env.THROTTLE_LIMIT ?? '10', 10),
      },
    ]),
    CommonModule,
    RedisModule,
    UsersModule,
    AuthModule,
    WorkspacesModule,
    ChannelsModule,
    MessagesModule,
    GatewayModule,
    InvitesModule,
    MailModule,
    UploadsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
