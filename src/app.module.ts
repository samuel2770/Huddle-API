import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ChannelsModule } from './channels/channels.module.js';
import { MessagesModule } from './messages/messages.module.js';
import { CommonModule } from './common/common.module.js';
import { User } from './users/entities/user.entity.js';
import { Workspace } from './workspaces/entities/workspace.entity.js';
import { Channel } from './channels/entities/channel.entity.js';
import { ChannelMember } from './channels/entities/channel-member.entity.js';
import { Message } from './messages/entities/message.entity.js';
import { Attachment } from './messages/entities/attachment.entity.js';

@Module({
  imports: [
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
      ],
      autoLoadEntities: true,
      synchronize: process.env.DB_SYNCHRONIZE !== 'false',
      logging: process.env.DB_LOGGING === 'true',
    }),
    CommonModule,
    ChannelsModule,
    MessagesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
