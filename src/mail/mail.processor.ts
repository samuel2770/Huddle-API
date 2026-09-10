import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { MailService } from './mail.service.js';

export interface InviteEmailJobData {
  email: string;
  workspaceId: string;
  workspaceName: string;
  inviterName: string;
  inviteToken: string;
}

export interface PasswordResetEmailJobData {
  email: string;
  resetToken: string;
}

@Processor('mail')
export class MailProcessor extends WorkerHost {
  constructor(private readonly mailService: MailService) {
    super();
  }

  async process(
    job: Job<InviteEmailJobData | PasswordResetEmailJobData>,
  ): Promise<void> {
    switch (job.name) {
      case 'send-invite-email':
        await this.handleInviteEmail(job as Job<InviteEmailJobData>);
        break;
      case 'send-password-reset-email':
        await this.handlePasswordResetEmail(
          job as Job<PasswordResetEmailJobData>,
        );
        break;
      default:
        console.warn(`[MailProcessor] Unknown job name: ${job.name}`);
    }
  }

  private async handleInviteEmail(job: Job<InviteEmailJobData>): Promise<void> {
    const { email, workspaceName, inviterName, inviteToken } = job.data;

    await this.mailService.sendMail({
      to: email,
      subject: `You've been invited to join ${workspaceName} on Huddle`,
      text: `${inviterName} has invited you to join the ${workspaceName} workspace on Huddle.\n\nAccept your invite: ${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/invites/accept?token=${inviteToken}`,
      html: `
        <h2>You've been invited to Huddle!</h2>
        <p><strong>${inviterName}</strong> has invited you to join the <strong>${workspaceName}</strong> workspace.</p>
        <p><a href="${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/invites/accept?token=${inviteToken}">Accept Invite</a></p>
      `,
    });
  }

  private async handlePasswordResetEmail(
    job: Job<PasswordResetEmailJobData>,
  ): Promise<void> {
    const { email, resetToken } = job.data;

    await this.mailService.sendMail({
      to: email,
      subject: 'Reset your Huddle password',
      text: `You requested a password reset. Use this link to reset your password: ${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/reset-password?token=${resetToken}`,
      html: `
        <h2>Password Reset</h2>
        <p>You requested a password reset for your Huddle account.</p>
        <p><a href="${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/reset-password?token=${resetToken}">Reset Password</a></p>
        <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      `,
    });
  }
}
