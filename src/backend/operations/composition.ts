import { SystemClock } from "@/backend/platform/horloge/horloge";
import { obtenirIdentiteEntreprise } from "@/backend/identite-entreprise";
import type { Acteur } from "@/shared/acces/acteur";
import { creerCasDUsageOperations } from "./application/cas-d-usage";
import { creerCasDUsageRapport } from "./application/cas-d-usage-rapport";
import { creerCasDUsageTerrain } from "./application/cas-d-usage-terrain";
import { creerVerificationConflits } from "./application/verifier-conflits";
import type {
  FiltreOperations,
  OccurrencePlanifiee,
  OperationRealisee,
  OperationSaisie,
  Pagination,
} from "./domain/operation";
import { AffectationsMongoose } from "./infrastructure/mongoose/affectations.mongoose";
import { OperationRepositoryMongoose } from "./infrastructure/mongoose/operation.repository.mongoose";
import { GenerateurRapportJsPdf } from "./infrastructure/pdf/generateur-rapport.jspdf";
import { ChauffeurSansEquipe, CompteClientSansPerimetre, OperationIntrouvable } from "./domain/erreurs";

const operations = new OperationRepositoryMongoose();
const horloge = new SystemClock();

export const checkAssignmentConflicts = creerVerificationConflits({
  affectations: new AffectationsMongoose(),
});

export const casDUsageOperations = creerCasDUsageOperations({
  operations,
  verifierConflits: checkAssignmentConflicts,
  horloge,
});

export function listerOperationsPourActeur(
  acteur: Acteur,
  filtre: FiltreOperations,
  pagination: Pagination
) {
  return casDUsageOperations.lister(acteur, filtre, pagination);
}

export async function verifierAccesOperation(
  acteur: Acteur,
  operationId: string
): Promise<"ok" | "not-found" | "forbidden"> {
  try {
    await casDUsageOperations.obtenir(acteur, operationId);
    return "ok";
  } catch (erreur) {
    if (erreur instanceof OperationIntrouvable) return "not-found";
    if (erreur instanceof ChauffeurSansEquipe || erreur instanceof CompteClientSansPerimetre) return "forbidden";
    throw erreur;
  }
}

export const casDUsageTerrain = creerCasDUsageTerrain({
  operations,
  horloge,
  // Fonction (et non alias direct de `console.warn`) : relit `console.warn` à chaque appel, donc
  // reste observable par un test qui l'espionne après le chargement du module (leçon R3b).
  alerteCoherence: (message) => console.warn(message),
});

import { sendMail } from "@/backend/platform/email";
import type { MessageEmailRapport } from "./domain/ports";

const adaptateurEmailRapport = {
  async envoyer(message: MessageEmailRapport) {
    const res = await sendMail({
      to: message.destinataire,
      subject: message.sujet,
      text: message.texte,
      html: message.html,
      attachments: [
        {
          filename: message.pieceJointe.nomFichier,
          content: message.pieceJointe.contenu,
          contentType: message.pieceJointe.typeMime,
        },
      ],
    });
    return res.ok ? { ok: true } : { ok: false, raison: res.reason };
  },
};

export const casDUsageRapport = creerCasDUsageRapport({
  obtenir: casDUsageOperations.obtenir,
  generateur: new GenerateurRapportJsPdf(),
  horloge,
  obtenirIdentiteEntreprise,
  envoiEmail: adaptateurEmailRapport,
  changerStatut: (id, changement) => operations.changerStatut(id, changement),
});

// Capacités ciblées exposées aux autres domaines par `index.ts` (jamais le dépôt ni le modèle).

/** Une opération existe déjà pour ce client, ce site et cette date exacte. */
export function existeOperationSurCreneau(clientId: string, siteId: string, dateHeurePrevue: Date): Promise<boolean> {
  return casDUsageOperations.existeSurCreneau(clientId, siteId, dateHeurePrevue);
}

/** Crée une opération planifiée par un autre domaine ; `parUtilisateur` signe la première entrée d'historique. */
export async function creerOperationPlanifiee(occurrence: OccurrencePlanifiee, parUtilisateur: string): Promise<void> {
  await casDUsageOperations.creerPlanifiee(parUtilisateur, occurrence);
}

export function creerOperationDemande(
  saisie: OperationSaisie,
  parUtilisateur: string,
  sourceDemandeId?: string
) {
  return casDUsageOperations.soumettreDemande(saisie, parUtilisateur, sourceDemandeId);
}

/** Une opération existe déjà pour ce site, cette date exacte et cette quantité collectée. */
export function existeOperationCollectee(siteId: string, dateHeurePrevue: Date, quantiteCollectee: number): Promise<boolean> {
  return operations.existeCollecte(siteId, dateHeurePrevue, quantiteCollectee);
}

/** Enregistre une collecte déjà réalisée (import de données passées). */
export function enregistrerOperationRealisee(collecte: OperationRealisee): Promise<void> {
  return operations.creerRealisee(collecte);
}
