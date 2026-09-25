import { describe, it, expect, beforeEach } from "vitest";
import { creerCasDUsageEquipements } from "./cas-d-usage";
import { EquipementIntrouvable } from "../domain/erreurs";
import { EquipementRepositoryEnMemoire } from "../infrastructure/en-memoire/equipement.repository.en-memoire";

let cas: ReturnType<typeof creerCasDUsageEquipements>;
const saisie = (nom: string) => ({ nom, type: "Pompe", disponibilite: true });

beforeEach(() => {
  cas = creerCasDUsageEquipements({ equipements: new EquipementRepositoryEnMemoire() });
});

describe("cas d'usage des équipements", () => {
  it("liste les équipements triés par nom (ordre binaire : majuscules avant minuscules)", async () => {
    await cas.creer(saisie("b"));
    await cas.creer(saisie("A"));
    expect((await cas.lister()).map((e) => e.nom)).toEqual(["A", "b"]);
  });

  it("crée puis obtient un équipement avec sa révision initiale", async () => {
    const cree = await cas.creer(saisie("Pompe A"));
    expect(cree.revision).toBe(0);
    expect(await cas.obtenir(cree.id)).toMatchObject({ nom: "Pompe A", type: "Pompe" });
  });

  it("obtenir un équipement inconnu lève EquipementIntrouvable", async () => {
    await expect(cas.obtenir("inconnu")).rejects.toBeInstanceOf(EquipementIntrouvable);
  });

  it("modifie un équipement existant et refuse un équipement inconnu", async () => {
    const cree = await cas.creer(saisie("A"));
    expect((await cas.modifier(cree.id, { ...saisie("B"), disponibilite: false })).disponibilite).toBe(false);
    await expect(cas.modifier("inconnu", saisie("C"))).rejects.toBeInstanceOf(EquipementIntrouvable);
  });

  it("supprime un équipement sans contrôle de rattachement et refuse un équipement inconnu", async () => {
    const cree = await cas.creer(saisie("A"));
    await cas.supprimer(cree.id);
    await expect(cas.obtenir(cree.id)).rejects.toBeInstanceOf(EquipementIntrouvable);
    await expect(cas.supprimer(cree.id)).rejects.toBeInstanceOf(EquipementIntrouvable);
  });
});
