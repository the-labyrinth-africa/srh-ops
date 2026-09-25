import { describe, it, expect } from "vitest";
import { SiteRepositoryMongoose } from "./site.repository.mongoose";
import { Client as ClientModel } from "./client.model";

const depot = new SiteRepositoryMongoose();
const saisie = (clientId: string, nom: string) => ({
  clientId,
  nom,
  adresse: "",
  typeDechets: [] as string[],
  observations: "",
});

async function creerUnClient(nom = "Client Test") {
  const client = await ClientModel.create({ nom, contact: { telephone: "0102030405", email: "c@srh.ci" } });
  return String(client._id);
}

describe("SiteRepositoryMongoose (contrat)", () => {
  it("crée puis relit un site : clientId NON peuplé après `creer`", async () => {
    const clientId = await creerUnClient();
    const cree = await depot.creer(saisie(clientId, "Alpha"));
    expect(cree.id).toMatch(/^[a-f\d]{24}$/);
    expect(cree.clientId).toBe(clientId);
    expect(cree.revision).toBe(0);
    expect(cree.createdAt).toBeInstanceOf(Date);
    expect(cree.updatedAt).toBeInstanceOf(Date);
  });

  it("trouverParId renvoie le site avec clientId peuplé ({id, nom})", async () => {
    const clientId = await creerUnClient("Client Alpha");
    const cree = await depot.creer(saisie(clientId, "Alpha"));
    const relu = await depot.trouverParId(cree.id);
    expect(relu?.clientId).toEqual({ id: clientId, nom: "Client Alpha" });
  });

  it("trouverParId renvoie null pour un identifiant inconnu", async () => {
    expect(await depot.trouverParId("507f1f77bcf86cd799439099")).toBeNull();
  });

  it("lister renvoie les sites triés par nom, avec clientId peuplé ({id, nom})", async () => {
    const clientId = await creerUnClient("Client Beta");
    await depot.creer(saisie(clientId, "Beta"));
    await depot.creer(saisie(clientId, "Alpha"));
    const liste = await depot.lister();
    expect(liste.map((s) => s.nom)).toEqual(["Alpha", "Beta"]);
    expect(liste[0].clientId).toEqual({ id: clientId, nom: "Client Beta" });
  });

  it("lister filtre par clientId", async () => {
    const clientA = await creerUnClient("Client A");
    const clientB = await creerUnClient("Client B");
    await depot.creer(saisie(clientA, "Site A"));
    await depot.creer(saisie(clientB, "Site B"));
    expect((await depot.lister(clientA)).map((s) => s.nom)).toEqual(["Site A"]);
  });

  it("modifie ; null pour un identifiant inconnu", async () => {
    const clientId = await creerUnClient();
    const cree = await depot.creer(saisie(clientId, "Alpha"));
    expect(await depot.modifier(cree.id, saisie(clientId, "Alpha modifié"))).toMatchObject({ nom: "Alpha modifié" });
    expect(await depot.modifier("507f1f77bcf86cd799439099", saisie(clientId, "Z"))).toBeNull();
  });

  it("supprime et signale l'absence", async () => {
    const clientId = await creerUnClient();
    const cree = await depot.creer(saisie(clientId, "Alpha"));
    expect(await depot.supprimer(cree.id)).toBe(true);
    expect(await depot.supprimer(cree.id)).toBe(false);
  });

  it("crée avec un clientId inexistant sans lever d'erreur (aucune contrainte FK côté Mongo)", async () => {
    const cree = await depot.creer(saisie("507f1f77bcf86cd799439099", "Orphelin"));
    expect(cree.clientId).toBe("507f1f77bcf86cd799439099");
  });

  it("trouverParId et lister renvoient clientId: null quand le client référencé a été supprimé (référence pendante)", async () => {
    const clientId = await creerUnClient("Client à supprimer");
    const cree = await depot.creer(saisie(clientId, "Alpha"));
    await ClientModel.findByIdAndDelete(clientId);

    const relu = await depot.trouverParId(cree.id);
    expect(relu?.clientId).toBeNull();

    const liste = await depot.lister();
    expect(liste[0].clientId).toBeNull();
  });
});
