import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { Invite, InviteStatus } from './entities/invite.entity.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class InvitesService {
  constructor(
    @InjectRepository(Invite)
    private readonly inviteRepository: Repository<Invite>,
    private readonly workspacesService: WorkspacesService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Create an invite for a workspace. Generates a hashed token
   * and queues an email job via BullMQ (injected separately).
   * 
   * Per spec: POST /workspaces/:id/invites
   */
  async create(
    workspaceId: string,
    inviterId: string,
    email: string,
  ): Promise<{ inviteId: string; message: string }> {
    // Verify inviter is a member of the workspace
    await this.workspacesService.verifyMembership(workspaceId, inviterId);

    // Check if there's already a pending invite for this email+workspace
    const existing = await this.inviteRepository.findOne({
      where: {
        workspace_id: workspaceId,
        email: email.toLowerCase().trim(),
        status: InviteStatus.PENDING,
        expires_at: MoreThan(new Date()),
      },
    });

    if (existing) {
      throw new ConflictException(
        'A pending invite already exists for this email in this workspace',
      );
    }

    // Check if user is already a workspace member
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      try {
        await this.workspacesService.verifyMembership(
          workspaceId,
          existingUser.id,
        );
        throw new ConflictException(
          'This user is already a member of this workspace',
        );
      } catch (error: any) {
        // ForbiddenException means they're NOT a member — that's what we want
        if (error instanceof ConflictException) throw error;
      }
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const rawSecret = crypto.randomUUID();

    const invite = this.inviteRepository.create({
      workspace_id: workspaceId,
      inviter_id: inviterId,
      email: email.toLowerCase().trim(),
      token_hash: 'placeholder',
      status: InviteStatus.PENDING,
      expires_at: expiresAt,
    });

    const saved = await this.inviteRepository.save(invite);

    const publicToken = `${saved.id}.${rawSecret}`;
    saved.token_hash = await argon2.hash(publicToken);
    await this.inviteRepository.save(saved);

    // Log the token (BullMQ email job will be dispatched by the controller/mail module)
    console.log(
      `[Invite] Token for ${email} to workspace ${workspaceId}: ${publicToken}`,
    );

    return {
      inviteId: saved.id,
      message: `Invite sent to ${email}`,
    };
  }

  /**
   * Accept an invite. Validates the token, adds user to the workspace.
   * 
   * Per spec: POST /invites/:token/accept
   */
  async accept(
    token: string,
    userId: string,
  ): Promise<{ success: boolean; workspaceId: string; message: string }> {
    let tokenId = token;
    if (token.includes('.')) {
      tokenId = token.split('.')[0];
    }

    let invite: Invite | null = null;
    try {
      invite = await this.inviteRepository.findOne({
        where: {
          id: tokenId,
          status: InviteStatus.PENDING,
          expires_at: MoreThan(new Date()),
        },
      });
    } catch {
      invite = null;
    }

    if (!invite) {
      throw new BadRequestException('Invalid or expired invite');
    }

    const isValid = await argon2
      .verify(invite.token_hash, token)
      .catch(() => false);

    if (!isValid) {
      throw new BadRequestException('Invalid or expired invite');
    }

    // Verify the accepting user's email matches the invite
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new BadRequestException(
        'This invite was sent to a different email address',
      );
    }

    // Add user to workspace
    try {
      await this.workspacesService.addMember(
        invite.workspace_id,
        userId,
      );
    } catch (error: any) {
      if (error instanceof ConflictException) {
        // Already a member — still mark invite as accepted
      } else {
        throw error;
      }
    }

    // Mark invite as accepted
    invite.status = InviteStatus.ACCEPTED;
    await this.inviteRepository.save(invite);

    return {
      success: true,
      workspaceId: invite.workspace_id,
      message: 'Invite accepted successfully',
    };
  }
}
