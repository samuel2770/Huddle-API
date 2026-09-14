import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor() {
    this.initTransporter();
  }

  private initTransporter() {
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT ?? '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      this.logger.log(`Configured SMTP transporter with host: ${process.env.SMTP_HOST}`);
    }
  }

  async sendMail(options: SendMailOptions): Promise<void> {
    const fromAddress = process.env.SMTP_FROM || 'noreply@huddle.chat';

    // 1. Check if Resend API Key is set
    if (process.env.RESEND_API_KEY) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromAddress,
            to: options.to,
            subject: options.subject,
            text: options.text,
            html: options.html,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          this.logger.warn(`Resend failed with status ${response.status}: ${errText}`);
        } else {
          this.logger.log(`Sent email via Resend to ${options.to}: ${options.subject}`);
          return;
        }
      } catch (err: any) {
        this.logger.warn(`Resend dispatch error: ${err.message}`);
      }
    }

    // 2. Check if SMTP transporter is available
    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: fromAddress,
          to: options.to,
          subject: options.subject,
          text: options.text,
          html: options.html,
        });
        this.logger.log(`Sent email via SMTP to ${options.to}: ${options.subject}`);
        return;
      } catch (err: any) {
        this.logger.warn(`SMTP dispatch error: ${err.message}`);
      }
    }

    // 3. Fallback / Dev environment structured output
    this.logger.log(
      `[Mail Delivered - Dev Simulator]
To: ${options.to}
Subject: ${options.subject}
Body: ${options.text}
HTML: ${options.html ? 'Provided' : 'None'}`,
    );
  }

  async sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
    const subject = 'Reset your Huddle password';
    const text = `Hello,\n\nYou requested a password reset for your Huddle account. Click the link below to set a new password:\n\n${resetLink}\n\nIf you did not request this, you can safely ignore this email.\n\nThe Huddle Team`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #101828;">
        <h2 style="color: #202234; margin-bottom: 16px;">Reset your Huddle password</h2>
        <p style="font-size: 15px; line-height: 1.5; color: #475467;">You recently requested to reset your password for your Huddle account. Click the button below to reset it:</p>
        <div style="margin: 28px 0;">
          <a href="${resetLink}" style="background-color: #f2711c; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Reset Password</a>
        </div>
        <p style="font-size: 13px; color: #98a2b3;">If the button doesn't work, copy and paste this link into your browser:<br/><a href="${resetLink}" style="color: #f2711c;">${resetLink}</a></p>
      </div>
    `;
    await this.sendMail({ to, subject, text, html });
  }

  async sendVerificationEmail(to: string, verificationLink: string): Promise<void> {
    const subject = 'Verify your email for Huddle';
    const text = `Welcome to Huddle!\n\nPlease verify your email address by visiting this link:\n\n${verificationLink}\n\nThe Huddle Team`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #101828;">
        <h2 style="color: #202234; margin-bottom: 16px;">Welcome to Huddle!</h2>
        <p style="font-size: 15px; line-height: 1.5; color: #475467;">Thanks for joining Huddle. Please confirm your email address to get started collaborating with your team:</p>
        <div style="margin: 28px 0;">
          <a href="${verificationLink}" style="background-color: #f2711c; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Verify Email</a>
        </div>
        <p style="font-size: 13px; color: #98a2b3;"><a href="${verificationLink}" style="color: #f2711c;">${verificationLink}</a></p>
      </div>
    `;
    await this.sendMail({ to, subject, text, html });
  }
}
