import type { Acteur } from "@/shared/acces/acteur";
import { IdentifiantSuiviDuplique, TraceabiliteIntrouvable } from "../domain/erreurs";
import type { TraceabiliteRepository } from "../domain/ports";
import type { TraceabiliteSaisie } from "../domain/tracabilite";

export interface DependancesTracabilite {
  tracabilites: TraceabiliteRepository;
  verifierAccesOperation: (acteur: Acteur, operationId: string) => Promise<void>;
}

export function creerCasDUsageTracabilite({
  tracabilites,
  verifierAccesOperation,
}: DependancesTracabilite) {
  return {
    async listerParOperation(acteur: Acteur, operationId: string) {
      await verifierAccesOperation(acteur, operationId);
      return tracabilites.lister(operationId);
    },

    listerToutes() {
      return tracabilites.lister();
    },

    async creer(acteur: Acteur, operationId: string, saisie: TraceabiliteSaisie) {
      await verifierAccesOperation(acteur, operationId);
      try {
        return await tracabilites.creer(operationId, normaliser(saisie), acteur.id);
      } catch (erreur) {
        if (estConflitIdentifiant(erreur)) throw new IdentifiantSuiviDuplique();
        throw erreur;
      }
    },

    async modifier(
      acteur: Acteur,
      operationId: string,
      traceabiliteId: string,
      saisie: TraceabiliteSaisie
    ) {
      await verifierAccesOperation(acteur, operationId);
      const existante = await tracabilites.trouverParId(traceabiliteId);
      if (!existante || existante.operationId !== operationId) {
        throw new TraceabiliteIntrouvable();
      }

      try {
        const modifiee = await tracabilites.modifier(traceabiliteId, normaliser(saisie), acteur.id);
        if (!modifiee) throw new TraceabiliteIntrouvable();
        return modifiee;
      } catch (erreur) {
        if (estConflitIdentifiant(erreur)) throw new IdentifiantSuiviDuplique();
        throw erreur;
      }
    },
  };
}

function normaliser(saisie: TraceabiliteSaisie): TraceabiliteSaisie {
  return { ...saisie, identifiantSuivi: saisie.identifiantSuivi.trim().toUpperCase() };
}

function estConflitIdentifiant(erreur: unknown): boolean {
  return (
    typeof erreur === "object" &&
    erreur !== null &&
    "code" in erreur &&
    (erreur as { code?: unknown }).code === 11000
  );
}

export type CasDUsageTracabilite = ReturnType<typeof creerCasDUsageTracabilite>;
