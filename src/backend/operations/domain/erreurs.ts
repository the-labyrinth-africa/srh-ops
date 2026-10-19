import type { OperationStatus } from "@/shared/operations/statuts";
import type { ConflictResult } from "./conflits";
import { MESSAGE_CHAUFFEUR_SANS_EQUIPE, MESSAGE_HORS_EQUIPE } from "./visibilite";

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

/** Défense en profondeur : `requireAuth` refuse déjà ce compte avec le même message. */
export class CompteClientSansPerimetre extends Error {
  constructor() {
    super("Compte client sans périmètre attribué");
    this.name = "CompteClientSansPerimetre";
  }
}

export class OperationHorsEquipe extends Error {
  constructor() {
    super(MESSAGE_HORS_EQUIPE);
    this.name = "OperationHorsEquipe";
  }
}

export class TransitionInterdite extends Error {
  constructor(de: OperationStatus, vers: OperationStatus) {
    super(`Transition ${de} → ${vers} non autorisée`);
    this.name = "TransitionInterdite";
  }
}

export class PhotoRequise extends Error {
  constructor() {
    super("Photo requise (base64 data URL)");
    this.name = "PhotoRequise";
  }
}

export class FormatPhotoInvalide extends Error {
  constructor() {
    super("Format de photo invalide");
    this.name = "FormatPhotoInvalide";
  }
}

export class PhotoTropLourde extends Error {
  constructor() {
    super("La photo dépasse 2 Mo. Réduisez sa taille avant l'envoi.");
    this.name = "PhotoTropLourde";
  }
}

export class TropDePhotos extends Error {
  constructor() {
    super("Maximum de 10 photos atteint");
    this.name = "TropDePhotos";
  }
}

export class PhotosTropLourdes extends Error {
  constructor() {
    super("Les photos de cette opération dépassent 8 Mo au total.");
    this.name = "PhotosTropLourdes";
  }
}

export class UrlPhotoRequise extends Error {
  constructor() {
    super("URL de la photo requise");
    this.name = "UrlPhotoRequise";
  }
}

export class EmailClientManquant extends Error {
  constructor() {
    super("Aucune adresse e-mail trouvée pour ce client");
    this.name = "EmailClientManquant";
  }
}

export class EchecEnvoiRapportEmail extends Error {
  constructor(message = "Échec lors de l'envoi du rapport par e-mail") {
    super(message);
    this.name = "EchecEnvoiRapportEmail";
  }
}

export class RapportOperationNonTerminee extends Error {
  constructor() {
    super("Le rapport ne peut être envoyé qu'après la fin de l'intervention");
    this.name = "RapportOperationNonTerminee";
  }
}
