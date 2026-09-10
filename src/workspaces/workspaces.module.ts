import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workspace } from './entities/workspace.entity.js';
import { WorkspaceMember } from './entities/workspace-member.entity.js';
import { WorkspacesService } from './workspaces.service.js';
import { WorkspacesController } from './workspaces.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Workspace, WorkspaceMember])],
  controllers: [WorkspacesController],
  providers: [WorkspacesService],
  exports: [WorkspacesService, TypeOrmModule],
})
export class WorkspacesModule {}
