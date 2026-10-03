import { describe, it, expect, beforeEach } from "vitest";
import { creerVerificationRattachements } from "./verifier-rattachements";

describe("vérification des rattachements d'un compte (client, équipe)", () => {
  let clients: Set<string>;
  let equipes: Set<string>;
  let appels: string[];
  let verifier: ReturnType<typeof creerVerificationRattachements>;

  beforeEach(() => {
    clients = new Set(["client-a"]);
    equipes = new Set(["equipe-a"]);
    appels = [];
    verifier = creerVerificationRattachements({
      rattachements: {
        clientExiste: async (id) => {
          appels.push(`client:${id}`);
          return clients.has(id);
        },
        equipeExiste: async (id) => {
          appels.push(`equipe:${id}`);
          return equipes.has(id);
        },
      },
    });
  });

  it("sans client ni équipe : aucune erreur, aucune recherche", async () => {
    expect(await verifier({})).toBeNull();
    expect(await verifier({ clientId: "", equipeId: "" })).toBeNull();
    expect(appels).toEqual([]);
  });

  it("client et équipe existants : aucune erreur", async () => {
    expect(await verifier({ clientId: "client-a", equipeId: "equipe-a" })).toBeNull();
  });

  it("client inconnu : « Client introuvable »", async () => {
    expect(await verifier({ clientId: "client-x" })).toBe("Client introuvable");
  });

  it("équipe inconnue : « Équipe introuvable »", async () => {
    expect(await verifier({ equipeId: "equipe-x" })).toBe("Équipe introuvable");
  });

  it("le client est vérifié avant l'équipe, et un client inconnu arrête la vérification", async () => {
    expect(await verifier({ clientId: "client-x", equipeId: "equipe-x" })).toBe("Client introuvable");
    expect(appels).toEqual(["client:client-x"]);
  });
});
