export interface EmailNotification {
  to: string;
  subject: string;
  text: string;
}

export interface NotificationJob {
  id: string;
  to: string;
  subject: string;
  text: string;
  attempts: number;
}

export interface OperationNotificationInfo {
  id: string;
  clientId: string;
  natureIntervention: string;
  dateHeurePrevue: Date;
  clientEmails: string[];
}

export interface OperationNotification extends OperationNotificationInfo {
  statut: string;
}
