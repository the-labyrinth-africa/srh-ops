export class EquipeIntrouvable extends Error {
  constructor() {
    super("Non trouvé");
    this.name = "EquipeIntrouvable";
  }
}

export class EquipeRattachee extends Error {
  constructor() {
    super("Cette équipe est rattachée à des comptes utilisateurs");
    this.name = "EquipeRattachee";
  }
}
