import type { ConflictResult } from "./conflits";
import { MESSAGE_CHAUFFEUR_SANS_EQUIPE } from "./visibilite";

/** Opération inexistante, ou hors du périmètre de l'acteur (indiscernables pour lui). */
export class OperationIntrouvable extends Error {
  constructor() {
    super("Non trouvé");
    this.name = "OperationIntrouvable";
  }
}

export class ChauffeurSansEquipe extends Error {
  constructor() {
    super(MESSAGE_CHAUFFEUR_SANS_EQUIPE);
    this.name = "ChauffeurSansEquipe";
  }
}

export class ConflitAffectation extends Error {
  constructor(readonly conflits: ConflictResult[]) {
    super("Conflit d'affectation");
    this.name = "ConflitAffectation";
  }
}
