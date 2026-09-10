import { Injectable } from '@nestjs/common';

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Mail service stub. In production, wire up nodemailer transport.
 * In development, logs to console.
 */
@Injectable()
export class MailService {
  async sendMail(options: SendMailOptions): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      // TODO: Wire up real nodemailer transport
      // const transporter = nodemailer.createTransport({...});
      // await transporter.sendMail(options);
      console.log(`[Mail] Would send email to ${options.to}: ${options.subject}`);
    } else {
      console.log(
        `[Mail Dev] To: ${options.to} | Subject: ${options.subject} | Body: ${options.text}`,
      );
    }
  }
}
