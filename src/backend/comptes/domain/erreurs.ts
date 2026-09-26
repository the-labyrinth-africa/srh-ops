export class UtilisateurIntrouvable extends Error {
  constructor() {
    super("Utilisateur non trouvé");
    this.name = "UtilisateurIntrouvable";
  }
}

export class EmailDejaUtilise extends Error {
  constructor() {
    super("Cet e-mail est déjà utilisé");
    this.name = "EmailDejaUtilise";
  }
}

export class UsernameDejaUtilise extends Error {
  constructor() {
    super("Ce nom d'utilisateur est déjà utilisé");
    this.name = "UsernameDejaUtilise";
  }
}

export class SuppressionDeSoiInterdite extends Error {
  constructor() {
    super("Impossible de supprimer votre propre compte");
    this.name = "SuppressionDeSoiInterdite";
  }
}

export class LienInvalideOuExpire extends Error {
  code = "INVALID_LINK" as const;
  constructor() {
    super("Lien invalide ou expiré. Demandez un nouveau lien.");
    this.name = "LienInvalideOuExpire";
  }
}

export class MotDePasseActuelIncorrect extends Error {
  constructor() {
    super("Mot de passe actuel incorrect");
    this.name = "MotDePasseActuelIncorrect";
  }
}

export class NouveauMotDePasseIdentique extends Error {
  constructor() {
    super("Le nouveau mot de passe doit être différent de l'ancien");
    this.name = "NouveauMotDePasseIdentique";
  }
}

/**
 * Limite de débit atteinte (contrairement à un limiteur indisponible, qui n'est pas représenté
 * par une erreur : `forgot-password` l'avale silencieusement, `reset-password` le laisse se
 * propager tel quel jusqu'au contrôleur — cf. `domain/ports.ts`, `LimiteurDebit`).
 */
export class LimiteDeDebitAtteinte extends Error {
  constructor(public readonly retryApresSecondes: number) {
    super("Trop de tentatives. Réessayez plus tard.");
    this.name = "LimiteDeDebitAtteinte";
  }
}
