import { describe, it, expect, beforeEach } from "vitest";
import { creerCasDUsageVehicules } from "./cas-d-usage";
import { VehiculeIntrouvable } from "../domain/erreurs";
import { VehiculeRepositoryEnMemoire } from "../infrastructure/en-memoire/vehicule.repository.en-memoire";

let cas: ReturnType<typeof creerCasDUsageVehicules>;
const saisie = (identification: string) => ({ identification, type: "Citerne", capacite: 5000, disponibilite: true });

beforeEach(() => {
  cas = creerCasDUsageVehicules({ vehicules: new VehiculeRepositoryEnMemoire() });
});

describe("cas d'usage des véhicules", () => {
  it("liste les véhicules triés par immatriculation (ordre binaire : majuscules avant minuscules)", async () => {
    await cas.creer(saisie("b-2"));
    await cas.creer(saisie("A-1"));
    expect((await cas.lister()).map((v) => v.identification)).toEqual(["A-1", "b-2"]);
  });

  it("crée puis obtient un véhicule avec sa révision initiale", async () => {
    const cree = await cas.creer(saisie("1234-AB-01"));
    expect(cree.revision).toBe(0);
    expect(await cas.obtenir(cree.id)).toMatchObject({ identification: "1234-AB-01", capacite: 5000 });
  });

  it("obtenir un véhicule inconnu lève VehiculeIntrouvable", async () => {
    await expect(cas.obtenir("inconnu")).rejects.toBeInstanceOf(VehiculeIntrouvable);
  });

  it("modifie un véhicule existant et refuse un véhicule inconnu", async () => {
    const cree = await cas.creer(saisie("A-1"));
    expect((await cas.modifier(cree.id, { ...saisie("A-2"), disponibilite: false })).disponibilite).toBe(false);
    await expect(cas.modifier("inconnu", saisie("A-3"))).rejects.toBeInstanceOf(VehiculeIntrouvable);
  });

  it("supprime un véhicule sans contrôle de rattachement et refuse un véhicule inconnu", async () => {
    const cree = await cas.creer(saisie("A-1"));
    await cas.supprimer(cree.id);
    await expect(cas.obtenir(cree.id)).rejects.toBeInstanceOf(VehiculeIntrouvable);
    await expect(cas.supprimer(cree.id)).rejects.toBeInstanceOf(VehiculeIntrouvable);
  });
});
