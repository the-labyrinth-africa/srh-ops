import type { EmailNotification, NotificationJob, OperationNotification, OperationNotificationInfo } from "./notification";

export interface NotificationRepository {
  enqueue(key: string, message: EmailNotification, now: Date): Promise<boolean>;
  claim(now: Date, staleBefore: Date): Promise<NotificationJob | null>;
  markSent(id: string, now: Date, expiresAt: Date): Promise<void>;
  markRetry(id: string, attempts: number, reason: string, retryAt: Date, expiresAt: Date): Promise<void>;
  emailsInternes(): Promise<string[]>;
  operationInfo(id: string): Promise<OperationNotificationInfo | null>;
  operationsProchaines(debut: Date, fin: Date): Promise<OperationNotification[]>;
  operationsEnRetard(avant: Date): Promise<OperationNotification[]>;
}

export interface NotificationMail {
  send(message: EmailNotification): Promise<{ ok: true } | { ok: false; reason: string }>;
}
