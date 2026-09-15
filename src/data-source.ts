import 'dotenv/config';
import { DataSource } from 'typeorm';
import { User } from './users/entities/user.entity.js';
import { Workspace } from './workspaces/entities/workspace.entity.js';
import { WorkspaceMember } from './workspaces/entities/workspace-member.entity.js';
import { Channel } from './channels/entities/channel.entity.js';
import { ChannelMember } from './channels/entities/channel-member.entity.js';
import { Message } from './messages/entities/message.entity.js';
import { Attachment } from './messages/entities/attachment.entity.js';
import { RefreshToken } from './auth/entities/refresh-token.entity.js';
import { InitialHuddleSchema1726000000000 } from '../migrations/1726000000000-InitialHuddleSchema.js';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'huddle',
  entities: [
    User,
    Workspace,
    WorkspaceMember,
    Channel,
    ChannelMember,
    Message,
    Attachment,
    RefreshToken,
  ],
  migrations: [
    InitialHuddleSchema1726000000000,
  ],
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});
