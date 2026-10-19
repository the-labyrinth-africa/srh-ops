export class TraceabiliteIntrouvable extends Error {
  constructor() {
    super("Enregistrement de traçabilité introuvable");
    this.name = "TraceabiliteIntrouvable";
  }
}

export class IdentifiantSuiviDuplique extends Error {
  constructor() {
    super("Cet identifiant de suivi est déjà utilisé");
    this.name = "IdentifiantSuiviDuplique";
  }
}

export class TraceabiliteAccesRefuse extends Error {
  constructor() {
    super("Accès refusé à cette opération");
    this.name = "TraceabiliteAccesRefuse";
  }
}
