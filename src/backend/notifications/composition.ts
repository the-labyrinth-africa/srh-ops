import { sendMail } from "@/backend/platform/email";
import { creerCasDUsageNotifications } from "./application/cas-d-usage";
import { NotificationRepositoryMongoose } from "./infrastructure/mongoose/notification.repository.mongoose";

export const casDUsageNotifications = creerCasDUsageNotifications({
  repository: new NotificationRepositoryMongoose(),
  mail: {
    async send(message) {
      return sendMail(message);
    },
  },
});

export function notifierNouvelleDemande(demande: Parameters<typeof casDUsageNotifications.notifierNouvelleDemande>[0]) {
  return casDUsageNotifications.notifierNouvelleDemande(demande);
}

export function notifierDemandeQualifiee(operationId: string) {
  return casDUsageNotifications.notifierDemandeQualifiee(operationId);
}

export function notifierChangementStatut(
  operationId: string,
  ancienStatut: string,
  nouveauStatut: string,
  dateChangement: Date
) {
  return casDUsageNotifications.notifierChangementStatut(operationId, ancienStatut, nouveauStatut, dateChangement);
}

export function programmerAlertesQuotidiennes() {
  return casDUsageNotifications.programmerAlertesQuotidiennes();
}

export function traiterFileNotifications() {
  return casDUsageNotifications.traiterFile();
}
