import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Workspace } from './entities/workspace.entity.js';
import {
  WorkspaceMember,
  WorkspaceRole,
} from './entities/workspace-member.entity.js';
import { CreateWorkspaceDto } from './dto/create-workspace.dto.js';

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepository: Repository<WorkspaceMember>,
    private readonly dataSource: DataSource,
  ) {}

  async create(userId: string, dto: CreateWorkspaceDto): Promise<Workspace> {
    // Check slug uniqueness (also enforced at DB level via unique constraint)
    const existingSlug = await this.workspaceRepository.findOne({
      where: { slug: dto.slug },
    });
    if (existingSlug) {
      throw new ConflictException(
        `Workspace with slug "${dto.slug}" already exists`,
      );
    }

    // Use a transaction to atomically create workspace + owner membership
    return this.dataSource.transaction(async (manager) => {
      const workspace = manager.create(Workspace, {
        name: dto.name,
        slug: dto.slug,
        logo_url: dto.logoUrl ?? null,
        owner_id: userId,
      });
      const savedWorkspace = await manager.save(Workspace, workspace);

      const ownerMember = manager.create(WorkspaceMember, {
        workspace_id: savedWorkspace.id,
        user_id: userId,
        role: WorkspaceRole.OWNER,
      });
      await manager.save(WorkspaceMember, ownerMember);

      return savedWorkspace;
    });
  }

  async findAll(userId: string): Promise<Workspace[]> {
    return this.workspaceRepository
      .createQueryBuilder('workspace')
      .innerJoin(
        'workspace.members',
        'member',
        'member.user_id = :userId',
        { userId },
      )
      .orderBy('workspace.created_at', 'ASC')
      .getMany();
  }

  async findOne(workspaceId: string, userId: string): Promise<Workspace> {
    const workspace = await this.workspaceRepository.findOne({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundException(
        `Workspace with ID ${workspaceId} not found`,
      );
    }

    // Verify user is a member of this workspace
    const membership = await this.memberRepository.findOne({
      where: { workspace_id: workspaceId, user_id: userId },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this workspace');
    }

    return workspace;
  }

  async getMembers(
    workspaceId: string,
    userId: string,
  ): Promise<
    {
      id: string;
      fullName: string;
      email: string;
      avatarUrl: string | null;
      status: string;
      role: WorkspaceRole;
      joinedAt: Date;
    }[]
  > {
    // Verify the requesting user is a member
    const callerMembership = await this.memberRepository.findOne({
      where: { workspace_id: workspaceId, user_id: userId },
    });

    if (!callerMembership) {
      throw new ForbiddenException('You are not a member of this workspace');
    }

    const members = await this.memberRepository
      .createQueryBuilder('member')
      .innerJoinAndSelect('member.user', 'user')
      .where('member.workspace_id = :workspaceId', { workspaceId })
      .orderBy('member.joined_at', 'ASC')
      .getMany();

    return members.map((m) => ({
      id: m.user.id,
      fullName: m.user.full_name,
      email: m.user.email,
      avatarUrl: m.user.avatar_url,
      status: m.user.status,
      role: m.role,
      joinedAt: m.joined_at,
    }));
  }

  async addMember(
    workspaceId: string,
    userIdToAdd: string,
    role: WorkspaceRole = WorkspaceRole.MEMBER,
  ): Promise<WorkspaceMember> {
    const workspace = await this.workspaceRepository.findOne({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundException(
        `Workspace with ID ${workspaceId} not found`,
      );
    }

    const existing = await this.memberRepository.findOne({
      where: { workspace_id: workspaceId, user_id: userIdToAdd },
    });

    if (existing) {
      throw new ConflictException(
        'User is already a member of this workspace',
      );
    }

    const member = this.memberRepository.create({
      workspace_id: workspaceId,
      user_id: userIdToAdd,
      role,
    });

    return this.memberRepository.save(member);
  }

  async verifyMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMember> {
    const membership = await this.memberRepository.findOne({
      where: { workspace_id: workspaceId, user_id: userId },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this workspace');
    }

    return membership;
  }
}
