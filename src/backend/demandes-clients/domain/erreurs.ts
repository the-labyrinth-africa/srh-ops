export class DemandePubliqueIntrouvable extends Error {
  constructor() {
    super("Demande introuvable");
    this.name = "DemandePubliqueIntrouvable";
  }
}

export class LimiteDemandesAtteinte extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Trop de demandes. Réessayez ultérieurement.");
    this.name = "LimiteDemandesAtteinte";
  }
}

export class SiteDemandeInvalide extends Error {
  constructor() {
    super("Le site sélectionné n'appartient pas au client choisi.");
    this.name = "SiteDemandeInvalide";
  }
}

export class DemandeDejaTraitee extends Error {
  constructor() {
    super("Cette demande a déjà été traitée ou est en cours de traitement.");
    this.name = "DemandeDejaTraitee";
  }
}
