// src/backend/operations/application/cas-d-usage.ts
import type { Acteur } from "@/shared/acces/acteur";
import type { OperationStatus } from "@/shared/operations/statuts";
import { finPrevue } from "../domain/conflits";
import { ChauffeurSansEquipe, CompteClientSansPerimetre, ConflitAffectation, OperationIntrouvable } from "../domain/erreurs";
import {
  idDeReference,
  type FiltreOperations,
  type OccurrencePlanifiee,
  type Operation,
  type OperationSaisie,
  type Pagination,
} from "../domain/operation";
import type { Horloge, OperationRepository, VerificationConflits } from "../domain/ports";
import { computeEffectiveStatus } from "@/shared/operations/statut-effectif";
import { chauffeurSansEquipe, compteClientSansPerimetre, perimetreDeLecture, peutVoirOperation } from "../domain/visibilite";

export interface DependancesOperations {
  operations: OperationRepository;
  verifierConflits: VerificationConflits;
  horloge: Horloge;
}

/** Une opération telle que le planning la montre : statut calculé à l'affichage, heure de fin. */
export interface ElementPlanning {
  operation: Operation;
  statutEffectif: OperationStatus;
  fin: Date;
}

export function creerCasDUsageOperations({ operations, verifierConflits, horloge }: DependancesOperations) {
  function verifierAccesLecture(acteur: Acteur): void {
    if (chauffeurSansEquipe(acteur)) throw new ChauffeurSansEquipe();
    // Défense en profondeur : sans ce refus, le filtre de périmètre d'un compte client sans client
    // serait vide et il lirait tout. La garde d'authentification refuse déjà ce compte en amont.
    if (compteClientSansPerimetre(acteur)) throw new CompteClientSansPerimetre();
  }

  /** Le périmètre de l'acteur l'emporte sur les filtres qu'il a demandés. */
  function dansLePerimetre(acteur: Acteur, filtre: FiltreOperations): FiltreOperations {
    return { ...filtre, ...perimetreDeLecture(acteur) };
  }

  /** Statut initial : « Affectée » si l'équipe et le véhicule sont renseignés, sinon « Planifiée ». */
  function creerAvecStatutInitial(saisie: OperationSaisie, parUtilisateur: string): Promise<Operation> {
    const statut: OperationStatus = saisie.equipeId && saisie.vehiculeId ? "Affectée" : "Planifiée";
    return operations.creer(saisie, { statut, date: horloge.maintenant(), parUtilisateur });
  }

  return {
    verifierAccesLecture,

    async lister(
      acteur: Acteur,
      filtre: FiltreOperations,
      pagination: Pagination
    ): Promise<{ items: Operation[]; total: number }> {
      verifierAccesLecture(acteur);
      return operations.lister(dansLePerimetre(acteur, filtre), pagination);
    },

    async obtenir(acteur: Acteur, id: string): Promise<Operation> {
      verifierAccesLecture(acteur);
      const operation = await operations.trouverDetailParId(id);
      if (!operation) throw new OperationIntrouvable();
      const rattachements = {
        clientId: idDeReference(operation.clientId),
        equipeId: idDeReference(operation.equipeId),
      };
      // Hors périmètre : même réponse qu'une opération inexistante.
      if (!peutVoirOperation(acteur, rattachements)) throw new OperationIntrouvable();
      return operation;
    },

    async creer(acteur: Acteur, saisie: OperationSaisie): Promise<Operation> {
      const conflits = await verifierConflits({
        dateHeurePrevue: saisie.dateHeurePrevue,
        dureeEstimeeMinutes: saisie.dureeEstimeeMinutes,
        equipeId: saisie.equipeId,
        vehiculeId: saisie.vehiculeId,
      });
      if (conflits.some((conflit) => conflit.hasConflict)) throw new ConflitAffectation(conflits);

      return creerAvecStatutInitial(saisie, acteur.id);
    },

    /** Une opération existe déjà pour ce client, ce site et cette date exacte. */
    existeSurCreneau(clientId: string, siteId: string, dateHeurePrevue: Date): Promise<boolean> {
      return operations.existeSurCreneau(clientId, siteId, dateHeurePrevue);
    },

    /**
     * Crée une opération planifiée par un autre domaine (récurrences). Aucun contrôle bloquant de
     * conflit ici : l'appelant a déjà décidé quoi faire des ressources en conflit.
     */
    creerPlanifiee(parUtilisateur: string, occurrence: OccurrencePlanifiee): Promise<Operation> {
      return creerAvecStatutInitial(
        { ...occurrence, uniteQuantite: "Litres", remarquesTerrain: "", nomSignataireClient: "", signatureClient: "" },
        parUtilisateur
      );
    },

    async modifier(id: string, saisie: OperationSaisie): Promise<Operation> {
      // Le conflit est cherché avant de savoir si l'opération existe (ordre historique : 409 avant 404).
      const conflits = await verifierConflits({
        dateHeurePrevue: saisie.dateHeurePrevue,
        dureeEstimeeMinutes: saisie.dureeEstimeeMinutes,
        equipeId: saisie.equipeId,
        vehiculeId: saisie.vehiculeId,
        excludeOperationId: id,
      });
      if (conflits.some((conflit) => conflit.hasConflict)) throw new ConflitAffectation(conflits);

      const operation = await operations.modifier(id, saisie);
      if (!operation) throw new OperationIntrouvable();
      return operation;
    },

    async supprimer(id: string): Promise<void> {
      if (!(await operations.supprimer(id))) throw new OperationIntrouvable();
    },

    async planning(acteur: Acteur, filtre: FiltreOperations): Promise<ElementPlanning[]> {
      verifierAccesLecture(acteur);
      const trouvees = await operations.listerPourPlanning(dansLePerimetre(acteur, filtre));
      const maintenant = horloge.maintenant();
      return trouvees.map((operation) => ({
        operation,
        statutEffectif: computeEffectiveStatus(operation.statut, operation.dateHeurePrevue, maintenant),
        fin: finPrevue(operation.dateHeurePrevue, operation.dureeEstimeeMinutes),
      }));
    },
  };
}

export type CasDUsageOperations = ReturnType<typeof creerCasDUsageOperations>;
