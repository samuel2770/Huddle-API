import { DataSource } from 'typeorm';
import { User } from './users/entities/user.entity.js';
import { Workspace } from './workspaces/entities/workspace.entity.js';
import { Channel } from './channels/entities/channel.entity.js';
import { ChannelMember } from './channels/entities/channel-member.entity.js';
import { Message } from './messages/entities/message.entity.js';
import { Attachment } from './messages/entities/attachment.entity.js';
import { RefreshToken } from './auth/entities/refresh-token.entity.js';
import { PasswordResetToken } from './auth/entities/password-reset-token.entity.js';
import { CreateUsersTable1725880000000 } from '../migrations/1725880000000-create-users-table.js';
import { CreateRefreshTokensTable1725880000001 } from '../migrations/1725880000001-create-refresh-tokens-table.js';
import { CreatePasswordResetTokensTable1725880000002 } from '../migrations/1725880000002-create-password-reset-tokens-table.js';

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
    Channel,
    ChannelMember,
    Message,
    Attachment,
    RefreshToken,
    PasswordResetToken,
  ],
  migrations: [
    CreateUsersTable1725880000000,
    CreateRefreshTokensTable1725880000001,
    CreatePasswordResetTokensTable1725880000002,
  ],
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
});

export default AppDataSource;
