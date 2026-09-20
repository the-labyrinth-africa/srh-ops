import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { SmtpConfig } from "@/lib/mail/config";
import type { MailMessage, MailTransport } from "@/lib/mail/types";

export class SmtpTransport implements MailTransport {
  constructor(
    private readonly transporter: Pick<Transporter, "sendMail">,
    private readonly from: string
  ) {}

  static fromConfig(config: SmtpConfig): SmtpTransport {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: !config.secure,
      auth: { user: config.user, pass: config.pass },
      // Une fonction serverless ne doit jamais rester suspendue sur un serveur muet.
      dnsTimeout: 10_000,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    return new SmtpTransport(transporter, config.from);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
  }
}
