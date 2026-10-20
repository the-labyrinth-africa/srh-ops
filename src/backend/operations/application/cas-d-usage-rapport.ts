import type { Acteur } from "@/shared/acces/acteur";
import type { ChangementStatut } from "../domain/changement-statut";
import {
  EchecEnvoiRapportEmail,
  EmailClientManquant,
  RapportOperationNonTerminee,
} from "../domain/erreurs";
import type { Operation } from "../domain/operation";
import type { EnvoiEmailRapport, GenerateurRapportPdf, Horloge } from "../domain/ports";
import {
  IDENTITE_ENTREPRISE_PAR_DEFAUT,
  type IdentiteEntreprise,
} from "@/shared/entreprise/identite";
import { nomFichierRapport, referenceRapport } from "../domain/rapport";

export interface DependancesRapport {
  /** Lecture détaillée soumise au périmètre de l'acteur (celle du cas d'usage `obtenir`). */
  obtenir: (acteur: Acteur, id: string) => Promise<Operation>;
  generateur: GenerateurRapportPdf;
  horloge: Horloge;
  obtenirIdentiteEntreprise?: () => Promise<IdentiteEntreprise>;
  envoiEmail?: EnvoiEmailRapport;
  changerStatut?: (id: string, changement: ChangementStatut) => Promise<Operation | null>;
}

export interface RapportGenere {
  contenu: Uint8Array;
  nomFichier: string;
}

export interface ResultatEnvoiRapportEmail {
  ok: true;
  destinataire: string;
  nomFichier: string;
}

export function creerCasDUsageRapport({
  obtenir,
  generateur,
  horloge,
  obtenirIdentiteEntreprise = async () => IDENTITE_ENTREPRISE_PAR_DEFAUT,
  envoiEmail,
  changerStatut,
}: DependancesRapport) {
  return {
    /** Le rapport est régénéré à chaque demande ; il n'est jamais stocké dans l'opération. */
    async generer(acteur: Acteur, id: string): Promise<RapportGenere> {
      const operation = await obtenir(acteur, id);
      const identite = await obtenirIdentiteEntreprise();
      return {
        contenu: await generateur.generer(operation, horloge.maintenant(), identite),
        nomFichier: nomFichierRapport(operation.id),
      };
    },

    /**
     * Envoie le rapport PDF par e-mail au client et archive l'événement dans le statut
     * (passe en 'Rapportée' si l'opération était 'Terminée').
     */
    async envoyerParEmail(
      acteur: Acteur,
      id: string,
      destinataireSaisi?: string
    ): Promise<ResultatEnvoiRapportEmail> {
      const operation = await obtenir(acteur, id);
      if (operation.statut !== "Terminée" && operation.statut !== "Rapportée") {
        throw new RapportOperationNonTerminee();
      }

      const emailClient =
        destinataireSaisi?.trim() ||
        (typeof operation.clientId === "object" && operation.clientId?.contact?.email
          ? operation.clientId.contact.email.trim()
          : undefined);

      if (!emailClient) {
        throw new EmailClientManquant();
      }

      const maintenant = horloge.maintenant();
      const identite = await obtenirIdentiteEntreprise();
      const contenu = await generateur.generer(operation, maintenant, identite);
      const nomFichier = nomFichierRapport(operation.id);
      const ref = referenceRapport(operation.id);

      if (!envoiEmail) {
        throw new EchecEnvoiRapportEmail("Service d'envoi d'e-mail non configuré");
      }

      const siteNom =
        typeof operation.siteId === "object" && operation.siteId?.nom
          ? operation.siteId.nom
          : "Site client";

      const res = await envoiEmail.envoyer({
        destinataire: emailClient,
        sujet: `[${identite.sigle}] Rapport d'intervention #${ref} - ${operation.natureIntervention}`,
        texte: `Bonjour,\n\nVeuillez trouver ci-joint le rapport officiel pour l'intervention d'enlèvement et collecte #${ref} réalisée sur le site « ${siteNom} ».\n\nQuantité collectée : ${operation.quantiteCollectee ?? 0} ${operation.uniteQuantite || "Litres"}\n\nPour toute question, notre équipe d'exploitation reste à votre disposition.\n\nCordialement,\n${identite.nomEntreprise}${identite.siteWeb ? `\n${identite.siteWeb}` : ""}`,
        pieceJointe: {
          nomFichier,
          contenu: Buffer.from(contenu),
          typeMime: "application/pdf",
        },
      });

      if (!res.ok) {
        throw new EchecEnvoiRapportEmail(res.raison || "Échec lors de l'envoi de l'e-mail");
      }

      // Si l'opération est terminée, transition vers 'Rapportée'
      if (operation.statut === "Terminée" && changerStatut) {
        await changerStatut(operation.id, {
          statut: "Rapportée",
          ancienStatut: "Terminée",
          date: maintenant,
          parUtilisateur: acteur.id,
          remarquesTerrain: operation.remarquesTerrain,
        });
      }

      return {
        ok: true,
        destinataire: emailClient,
        nomFichier,
      };
    },
  };
}

export type CasDUsageRapport = ReturnType<typeof creerCasDUsageRapport>;
