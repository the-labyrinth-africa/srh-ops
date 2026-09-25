import { describe, it, expect } from "vitest";
import { ClientRepositoryMongoose } from "./client.repository.mongoose";

const depot = new ClientRepositoryMongoose();
const saisie = (nom: string) => ({ nom, contact: { telephone: "0102030405", email: `${nom.toLowerCase()}@srh.ci` } });

describe("ClientRepositoryMongoose (contrat)", () => {
  it("crée puis relit un client avec identifiant, dates, révision et contact", async () => {
    const cree = await depot.creer(saisie("Alpha"));
    expect(cree.id).toMatch(/^[a-f\d]{24}$/);
    expect(cree.revision).toBe(0);
    expect(cree.createdAt).toBeInstanceOf(Date);
    expect(cree.updatedAt).toBeInstanceOf(Date);
    expect(await depot.trouverParId(cree.id)).toMatchObject({
      nom: "Alpha",
      contact: { telephone: "0102030405", email: "alpha@srh.ci" },
    });
  });

  it("trouverParId renvoie null pour un identifiant inconnu", async () => {
    expect(await depot.trouverParId("507f1f77bcf86cd799439099")).toBeNull();
  });

  it("liste par nom croissant (ordre binaire)", async () => {
    await depot.creer(saisie("Beta"));
    await depot.creer(saisie("Alpha"));
    expect((await depot.lister()).map((c) => c.nom)).toEqual(["Alpha", "Beta"]);
  });

  it("liste filtrée par idClient", async () => {
    const alpha = await depot.creer(saisie("Alpha"));
    await depot.creer(saisie("Beta"));
    expect((await depot.lister(alpha.id)).map((c) => c.nom)).toEqual(["Alpha"]);
  });

  it("modifie ; null pour un identifiant inconnu", async () => {
    const cree = await depot.creer(saisie("Alpha"));
    expect(await depot.modifier(cree.id, saisie("Alpha modifié"))).toMatchObject({ nom: "Alpha modifié" });
    expect(await depot.modifier("507f1f77bcf86cd799439099", saisie("Z"))).toBeNull();
  });

  it("supprime et signale l'absence", async () => {
    const cree = await depot.creer(saisie("Alpha"));
    expect(await depot.supprimer(cree.id)).toBe(true);
    expect(await depot.supprimer(cree.id)).toBe(false);
  });
});
