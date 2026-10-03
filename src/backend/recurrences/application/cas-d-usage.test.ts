import { describe, it, expect, beforeEach } from "vitest";
import { RecurrenceIntrouvable } from "../domain/erreurs";
import type { RecurrenceSaisie } from "../domain/recurrence";
import { RecurrenceRepositoryEnMemoire } from "../infrastructure/en-memoire/recurrence.repository.en-memoire";
import { creerCasDUsageRecurrences } from "./cas-d-usage";

const saisie = (surcharge: Partial<RecurrenceSaisie> = {}): RecurrenceSaisie => ({
  clientId: "client-a",
  siteId: "site-a",
  natureIntervention: "Collecte",
  frequence: "hebdomadaire",
  heurePrevue: "08:00",
  dureeEstimeeMinutes: 120,
  equipementIds: [],
  informationsParticulieres: "",
  active: true,
  ...surcharge,
});

describe("cas d'usage des récurrences (CRUD)", () => {
  let recurrences: RecurrenceRepositoryEnMemoire;
  let casDUsage: ReturnType<typeof creerCasDUsageRecurrences>;

  beforeEach(() => {
    recurrences = new RecurrenceRepositoryEnMemoire();
    casDUsage = creerCasDUsageRecurrences({ recurrences });
  });

  it("lister transmet le filtre tel quel au dépôt", async () => {
    await casDUsage.lister({ clientId: "client-b", active: false });
    expect(recurrences.filtresRecus).toEqual([{ clientId: "client-b", active: false }]);
  });

  it("creer puis obtenir", async () => {
    const creee = await casDUsage.creer(saisie());
    expect((await casDUsage.obtenir(creee.id)).natureIntervention).toBe("Collecte");
  });

  it("obtenir, modifier, supprimer une récurrence inconnue : RecurrenceIntrouvable « Récurrence non trouvée »", async () => {
    await expect(casDUsage.obtenir("absente")).rejects.toThrow(RecurrenceIntrouvable);
    await expect(casDUsage.obtenir("absente")).rejects.toThrow("Récurrence non trouvée");
    await expect(casDUsage.modifier("absente", saisie())).rejects.toThrow(RecurrenceIntrouvable);
    await expect(casDUsage.supprimer("absente")).rejects.toThrow(RecurrenceIntrouvable);
  });

  it("modifier renvoie la récurrence modifiée ; supprimer la retire", async () => {
    const { id } = await casDUsage.creer(saisie());
    expect((await casDUsage.modifier(id, saisie({ natureIntervention: "Modifiée" }))).natureIntervention).toBe("Modifiée");
    await expect(casDUsage.supprimer(id)).resolves.toBeUndefined();
    await expect(casDUsage.obtenir(id)).rejects.toThrow(RecurrenceIntrouvable);
  });
});
