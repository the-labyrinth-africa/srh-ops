/** Le classeur ne contient aucune ligne exploitable (en-têtes introuvables, feuille vide, lignes toutes ignorées). */
export class AucuneLigneExploitable extends Error {
  constructor(readonly erreurs: { row: number; message: string }[]) {
    super(erreurs[0]?.message || "Aucune ligne exploitable détectée dans le fichier.");
    this.name = "AucuneLigneExploitable";
  }
}

export class ClientIntrouvable extends Error {
  constructor() {
    super("Client introuvable.");
    this.name = "ClientIntrouvable";
  }
}
