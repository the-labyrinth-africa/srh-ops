export class EquipementIntrouvable extends Error {
  constructor() {
    super("Non trouvé");
    this.name = "EquipementIntrouvable";
  }
}
