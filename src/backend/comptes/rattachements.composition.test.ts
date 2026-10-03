import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Equipe } from "@/backend/equipes/infrastructure/mongoose/equipe.model";
import { erreurDeRattachement } from "./composition";

// Test d'assemblage : la vérification passe par l'API publique de `clients-sites` et d'`equipes`
// (base réelle), y compris quand ce module est le premier chargé (dépendance circulaire).
describe("erreurDeRattachement (assemblage réel)", () => {
  const inconnu = () => String(new mongoose.Types.ObjectId());

  it("client et équipe existants : aucune erreur", async () => {
    const client = await Client.create({ nom: "Client A" });
    const equipe = await Equipe.create({ nom: "Équipe A" });
    expect(await erreurDeRattachement({ clientId: String(client._id), equipeId: String(equipe._id) })).toBeNull();
  });

  it("client inconnu, équipe inconnue : messages exacts", async () => {
    expect(await erreurDeRattachement({ clientId: inconnu() })).toBe("Client introuvable");
    expect(await erreurDeRattachement({ equipeId: inconnu() })).toBe("Équipe introuvable");
  });

  it("un identifiant d'équipe ne vaut pas pour un client, et inversement", async () => {
    const client = await Client.create({ nom: "Client B" });
    const equipe = await Equipe.create({ nom: "Équipe B" });
    expect(await erreurDeRattachement({ clientId: String(equipe._id) })).toBe("Client introuvable");
    expect(await erreurDeRattachement({ equipeId: String(client._id) })).toBe("Équipe introuvable");
  });
});
