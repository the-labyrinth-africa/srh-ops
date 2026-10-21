import type { EmailNotification, NotificationJob, OperationNotification, OperationNotificationInfo } from "./notification";
import type { AbonnementPush, MessagePush } from "./push";

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

export interface AbonnementPushRepository {
  enregistrer(userId: string, role: string, subscription: Omit<AbonnementPush, "id" | "userId" | "role">): Promise<void>;
  retirer(userId: string, endpoint: string): Promise<void>;
  lister(roles: string[]): Promise<AbonnementPush[]>;
  supprimer(id: string): Promise<void>;
}

export interface LivraisonPush {
  clePublique(): string | null;
  estConfiguree(): boolean;
  envoyer(abonnement: AbonnementPush, message: MessagePush): Promise<void>;
}
