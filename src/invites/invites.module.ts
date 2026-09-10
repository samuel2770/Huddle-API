import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invite } from './entities/invite.entity.js';
import { InvitesService } from './invites.service.js';
import { InvitesController } from './invites.controller.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invite]),
    WorkspacesModule,
    UsersModule,
    AuthModule,
  ],
  controllers: [InvitesController],
  providers: [InvitesService],
  exports: [InvitesService],
})
export class InvitesModule {}
