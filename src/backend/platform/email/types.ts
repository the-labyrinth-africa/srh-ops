export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

export type MailResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "send_failed" };
