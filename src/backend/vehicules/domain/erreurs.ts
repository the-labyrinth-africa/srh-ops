export class VehiculeIntrouvable extends Error {
  constructor() {
    super("Non trouvé");
    this.name = "VehiculeIntrouvable";
  }
}
