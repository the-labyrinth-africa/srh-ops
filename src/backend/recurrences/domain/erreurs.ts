export class RecurrenceIntrouvable extends Error {
  constructor() {
    super("Récurrence non trouvée");
    this.name = "RecurrenceIntrouvable";
  }
}
