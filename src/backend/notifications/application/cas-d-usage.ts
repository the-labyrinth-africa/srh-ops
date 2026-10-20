import type { OperationNotificationInfo } from "../domain/notification";
import type { NotificationMail, NotificationRepository } from "../domain/ports";

const MAX_TENTATIVES = 8;
const MAX_JOBS_PAR_EXECUTION = 100;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

function cleJour(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function titreOperation(operation: OperationNotificationInfo): string {
  return `${operation.natureIntervention} — ${operation.dateHeurePrevue.toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" })}`;
}

export function creerCasDUsageNotifications({
  repository,
  mail,
  maintenant = () => new Date(),
}: {
  repository: NotificationRepository;
  mail: NotificationMail;
  maintenant?: () => Date;
}) {
  async function ajouterPourDestinataires(
    cle: string,
    destinataires: string[],
    sujet: string,
    texte: string
  ): Promise<number> {
    const unique = [...new Set(destinataires.map((email) => email.trim().toLowerCase()).filter(Boolean))];
    let programmees = 0;
    for (const email of unique) {
      if (await repository.enqueue(`${cle}:${email}`, { to: email, subject: sujet, text: texte }, maintenant())) {
        programmees++;
      }
    }
    return programmees;
  }

  async function traiterFile(limite = MAX_JOBS_PAR_EXECUTION): Promise<{ envoyes: number; aReessayer: number; echecDefinitif: number }> {
    let envoyes = 0;
    let aReessayer = 0;
    let echecDefinitif = 0;
    for (let index = 0; index < limite; index++) {
      const maintenantDate = maintenant();
      const job = await repository.claim(maintenantDate, new Date(maintenantDate.getTime() - 10 * 60_000));
      if (!job) break;

      let resultat: Awaited<ReturnType<NotificationMail["send"]>>;
      try {
        resultat = await mail.send({ to: job.to, subject: job.subject, text: job.text });
      } catch (error) {
        console.error(
          `[notifications] Échec du transport pour le job ${job.id} :`,
          error instanceof Error ? error.name : "erreur inconnue"
        );
        resultat = { ok: false, reason: "transport_error" };
      }
      if (resultat.ok) {
        await repository.markSent(job.id, maintenant(), new Date(maintenant().getTime() + RETENTION_MS));
        envoyes++;
        continue;
      }

      const definitif = job.attempts >= MAX_TENTATIVES;
      const delai = Math.min(6 * 60 * 60_000, 60_000 * 2 ** Math.max(0, job.attempts - 1));
      await repository.markRetry(
        job.id,
        job.attempts,
        resultat.reason,
        new Date(maintenant().getTime() + delai),
        new Date(maintenant().getTime() + RETENTION_MS)
      );
      if (definitif) echecDefinitif++;
      else aReessayer++;
    }
    return { envoyes, aReessayer, echecDefinitif };
  }

  return {
    async notifierNouvelleDemande(demande: {
      id: string;
      nomClient: string;
      nomContact: string;
      email: string;
      nomSite: string;
      natureIntervention: string;
      dateSouhaitee: Date;
    }): Promise<void> {
      const destinataires = await repository.emailsInternes();
      if (destinataires.length === 0) {
        console.warn("[notifications] Aucun compte admin/dispatcher avec e-mail pour la nouvelle demande.");
        return;
      }
      await ajouterPourDestinataires(
        `demande:${demande.id}:recue`,
        destinataires,
        "Nouvelle demande de collecte à examiner",
        [
          "Une demande publique attend la qualification de l'équipe.",
          `Entreprise : ${demande.nomClient}`,
          `Contact : ${demande.nomContact} (${demande.email})`,
          `Site : ${demande.nomSite}`,
          `Intervention : ${demande.natureIntervention}`,
          `Date souhaitée : ${demande.dateSouhaitee.toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" })}`,
          `Référence interne : ${demande.id}`,
        ].join("\n")
      );
    },

    async notifierDemandeQualifiee(operationId: string): Promise<void> {
      const operation = await repository.operationInfo(operationId);
      if (!operation) return;
      await ajouterPourDestinataires(
        `operation:${operation.id}:demande-qualifiee`,
        operation.clientEmails,
        "Votre demande de collecte est prise en compte",
        `Votre demande pour ${titreOperation(operation)} a été qualifiée et figure dans votre espace client.`
      );
    },

    async notifierChangementStatut(
      operationId: string,
      ancienStatut: string,
      nouveauStatut: string,
      dateChangement: Date
    ): Promise<void> {
      const operation = await repository.operationInfo(operationId);
      if (!operation) return;
      await ajouterPourDestinataires(
        `operation:${operation.id}:statut:${dateChangement.toISOString()}`,
        operation.clientEmails,
        "Mise à jour de votre collecte",
        [
          `Le statut de votre opération « ${operation.natureIntervention} » a changé :`,
          `${ancienStatut} → ${nouveauStatut}`,
          `Date prévue : ${operation.dateHeurePrevue.toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" })}`,
        ].join("\n")
      );
    },

    async programmerAlertesQuotidiennes(): Promise<number> {
      const maintenantDate = maintenant();
      const demain = new Date(maintenantDate.getTime() + 24 * 60 * 60_000);
      const [prochaines, enRetard, emailsInternes] = await Promise.all([
        repository.operationsProchaines(maintenantDate, demain),
        repository.operationsEnRetard(maintenantDate),
        repository.emailsInternes(),
      ]);
      let programmees = 0;

      for (const operation of prochaines) {
        programmees += await ajouterPourDestinataires(
          `operation:${operation.id}:rappel:${cleJour(operation.dateHeurePrevue)}`,
          operation.clientEmails,
          "Rappel : collecte prévue dans les prochaines 24 heures",
          `La collecte « ${titreOperation(operation)} » est prévue dans les prochaines 24 heures.`
        );
      }

      for (const operation of enRetard) {
        const cle = `operation:${operation.id}:retard:${cleJour(maintenantDate)}`;
        const texte = [
          `L'opération « ${operation.natureIntervention} » est en retard.`,
          `Date prévue : ${operation.dateHeurePrevue.toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" })}`,
          `Référence : ${operation.id}`,
        ].join("\n");
        programmees += await ajouterPourDestinataires(cle, emailsInternes, "Opération en retard à traiter", texte);
      }
      return programmees;
    },

    traiterFile,
  };
}

export type CasDUsageNotifications = ReturnType<typeof creerCasDUsageNotifications>;
