export class ClientIntrouvable extends Error {
  constructor() {
    super("Non trouvé");
    this.name = "ClientIntrouvable";
  }
}

export class ClientRattache extends Error {
  constructor() {
    super("Ce client est rattaché à des comptes utilisateurs");
    this.name = "ClientRattache";
  }
}

export class SiteIntrouvable extends Error {
  constructor() {
    super("Non trouvé");
    this.name = "SiteIntrouvable";
  }
}
