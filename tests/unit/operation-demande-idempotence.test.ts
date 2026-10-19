import { describe, expect, it } from "vitest";
import { OperationRepositoryEnMemoire } from "@/backend/operations/infrastructure/en-memoire/operation.repository.en-memoire";

describe("idempotence des demandes converties en opérations", () => {
  it("retourne la même opération pour une source de demande déjà créée", async () => {
    const repository = new OperationRepositoryEnMemoire();
    const date = new Date("2030-01-01T10:00:00.000Z");
    const saisie = {
      clientId: "client-1",
      siteId: "site-1",
      natureIntervention: "Collecte",
      dateHeurePrevue: date,
      dureeEstimeeMinutes: 120,
      equipementIds: [],
      informationsParticulieres: "",
      uniteQuantite: "Litres" as const,
      remarquesTerrain: "",
      nomSignataireClient: "",
      signatureClient: "",
    };
    const statutInitial = { statut: "Demande" as const, date, parUtilisateur: "dispatcher-1" };

    const first = await repository.creerDemande(saisie, statutInitial, "demande-1");
    const second = await repository.creerDemande(saisie, statutInitial, "demande-1");
    const all = await repository.lister({}, { skip: 0, limit: 10 });

    expect(second.id).toBe(first.id);
    expect(all.total).toBe(1);
  });
});
