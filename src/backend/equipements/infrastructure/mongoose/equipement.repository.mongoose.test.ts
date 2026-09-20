import { describe, it, expect } from "vitest";
import { EquipementRepositoryMongoose } from "./equipement.repository.mongoose";

const depot = new EquipementRepositoryMongoose();
const saisie = (nom: string) => ({ nom, type: "Pompe", disponibilite: true });

describe("EquipementRepositoryMongoose (contrat)", () => {
  it("crée puis relit un équipement avec identifiant, dates et révision", async () => {
    const cree = await depot.creer(saisie("Pompe A"));
    expect(cree.id).toMatch(/^[a-f\d]{24}$/);
    expect(cree.revision).toBe(0);
    expect(cree.createdAt).toBeInstanceOf(Date);
    expect(await depot.trouverParId(cree.id)).toMatchObject({ nom: "Pompe A", type: "Pompe" });
  });

  it("liste par nom croissant (ordre binaire)", async () => {
    await depot.creer(saisie("b"));
    await depot.creer(saisie("A"));
    expect((await depot.lister()).map((e) => e.nom)).toEqual(["A", "b"]);
  });

  it("modifie ; null pour un identifiant inconnu", async () => {
    const cree = await depot.creer(saisie("A"));
    expect(await depot.modifier(cree.id, { ...saisie("B"), disponibilite: false })).toMatchObject({ nom: "B", disponibilite: false });
    expect(await depot.modifier("507f1f77bcf86cd799439099", saisie("Z"))).toBeNull();
  });

  it("supprime et signale l'absence", async () => {
    const cree = await depot.creer(saisie("A"));
    expect(await depot.supprimer(cree.id)).toBe(true);
    expect(await depot.supprimer(cree.id)).toBe(false);
  });
});
