import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { Client } from "./infrastructure/mongoose/client.model";
import { Site } from "./infrastructure/mongoose/site.model";
import { creerSite, existeClient, identifiantDuClient, trouverSiteDuClientParNom } from "./index";

// Premier module chargé = `clients-sites` (l'autre sens de la dépendance circulaire avec `comptes`).
describe("API publique de clients-sites", () => {
  const inconnu = () => String(new mongoose.Types.ObjectId());

  it("existeClient : vrai pour un client existant, faux sinon", async () => {
    const client = await Client.create({ nom: "Client A" });
    expect(await existeClient(String(client._id))).toBe(true);
    expect(await existeClient(inconnu())).toBe(false);
  });

  it("identifiantDuClient : identifiant canonique (minuscules), null si inconnu", async () => {
    const client = await Client.create({ nom: "Client A" });
    const id = String(client._id);
    expect(await identifiantDuClient(id)).toBe(id);
    expect(await identifiantDuClient(id.toUpperCase())).toBe(id);
    expect(await identifiantDuClient(inconnu())).toBeNull();
  });

  it("trouverSiteDuClientParNom : nom exact sans tenir compte de la casse, dans le seul périmètre du client", async () => {
    const client = await Client.create({ nom: "Client A" });
    const autre = await Client.create({ nom: "Client B" });
    const site = await Site.create({ clientId: client._id, nom: "PO Anoumabo" });
    await Site.create({ clientId: autre._id, nom: "pmc" });
    const clientId = String(client._id);

    expect(await trouverSiteDuClientParNom(clientId, "po anoumabo")).toBe(String(site._id));
    expect(await trouverSiteDuClientParNom(clientId, "  PO ANOUMABO ")).toBe(String(site._id));
    expect(await trouverSiteDuClientParNom(clientId, "po anoum")).toBeNull();
    expect(await trouverSiteDuClientParNom(clientId, "pmc")).toBeNull();
  });

  it("trouverSiteDuClientParNom : les caractères spéciaux du nom sont pris littéralement", async () => {
    const client = await Client.create({ nom: "Client A" });
    const site = await Site.create({ clientId: client._id, nom: "dépôt (a+b)." });
    await Site.create({ clientId: client._id, nom: "dépôt aab!" });
    expect(await trouverSiteDuClientParNom(String(client._id), "dépôt (a+b).")).toBe(String(site._id));
    expect(await trouverSiteDuClientParNom(String(client._id), ".*")).toBeNull();
  });

  it("creerSite : crée le site et renvoie son identifiant", async () => {
    const client = await Client.create({ nom: "Client A" });
    const id = await creerSite({
      clientId: String(client._id),
      nom: "pmc",
      adresse: "",
      localisation: { lat: 0, lng: 0 },
      typeDechets: ["Huiles usagées"],
      observations: "Importé depuis un fichier Excel",
    });
    const enBase = JSON.parse(JSON.stringify(await Site.findById(id).lean()));
    expect(enBase).toMatchObject({
      clientId: String(client._id),
      nom: "pmc",
      adresse: "",
      localisation: { lat: 0, lng: 0 },
      typeDechets: ["Huiles usagées"],
      observations: "Importé depuis un fichier Excel",
    });
  });
});
