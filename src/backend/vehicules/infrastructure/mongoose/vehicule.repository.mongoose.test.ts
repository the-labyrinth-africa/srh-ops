import { describe, it, expect, beforeAll } from "vitest";
import { VehiculeRepositoryMongoose } from "./vehicule.repository.mongoose";
import { Vehicule as VehiculeModel } from "./vehicule.model";

const depot = new VehiculeRepositoryMongoose();
const saisie = (identification: string) => ({ identification, type: "Citerne", capacite: 5000, disponibilite: true });

beforeAll(async () => {
  await VehiculeModel.init(); // l'index unique de l'immatriculation doit exister avant les tests de doublon
});

describe("VehiculeRepositoryMongoose (contrat)", () => {
  it("crée puis relit un véhicule avec identifiant, dates et révision", async () => {
    const cree = await depot.creer(saisie("1234-AB-01"));
    expect(cree.id).toMatch(/^[a-f\d]{24}$/);
    expect(cree.revision).toBe(0);
    expect(cree.createdAt).toBeInstanceOf(Date);
    expect(await depot.trouverParId(cree.id)).toMatchObject({ identification: "1234-AB-01", capacite: 5000 });
  });

  it("liste par immatriculation croissante (ordre binaire)", async () => {
    await depot.creer(saisie("b-2"));
    await depot.creer(saisie("A-1"));
    expect((await depot.lister()).map((v) => v.identification)).toEqual(["A-1", "b-2"]);
  });

  it("refuse une immatriculation déjà utilisée (erreur du dépôt non interceptée)", async () => {
    await depot.creer(saisie("DOUBLON"));
    await expect(depot.creer(saisie("DOUBLON"))).rejects.toThrow();
  });

  it("modifie ; null pour un identifiant inconnu", async () => {
    const cree = await depot.creer(saisie("A-1"));
    expect(await depot.modifier(cree.id, { ...saisie("A-2"), capacite: 1 })).toMatchObject({ identification: "A-2", capacite: 1 });
    expect(await depot.modifier("507f1f77bcf86cd799439099", saisie("Z"))).toBeNull();
  });

  it("supprime et signale l'absence", async () => {
    const cree = await depot.creer(saisie("A-1"));
    expect(await depot.supprimer(cree.id)).toBe(true);
    expect(await depot.supprimer(cree.id)).toBe(false);
  });
});
