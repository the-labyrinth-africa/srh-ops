import { describe, it, expect, beforeEach } from "vitest";
import { creerCasDUsageEquipes } from "./cas-d-usage";
import { EquipeIntrouvable, EquipeRattachee } from "../domain/erreurs";
import {
  EquipeRepositoryEnMemoire,
  RattachementsUtilisateursEnMemoire,
} from "../infrastructure/en-memoire/equipe.repository.en-memoire";

let equipes: EquipeRepositoryEnMemoire;
let rattachements: RattachementsUtilisateursEnMemoire;
let cas: ReturnType<typeof creerCasDUsageEquipes>;

const saisie = (nom: string) => ({ nom, membres: [], disponibilite: true });

beforeEach(() => {
  equipes = new EquipeRepositoryEnMemoire();
  rattachements = new RattachementsUtilisateursEnMemoire();
  cas = creerCasDUsageEquipes({ equipes, rattachements });
});

describe("cas d'usage des équipes", () => {
  it("liste les équipes triées par nom", async () => {
    await cas.creer(saisie("Zeta"));
    await cas.creer(saisie("Alpha"));
    expect((await cas.lister()).map((e) => e.nom)).toEqual(["Alpha", "Zeta"]);
  });

  it("trie par nom en ordre binaire comme MongoDB (majuscules avant minuscules)", async () => {
    await cas.creer(saisie("alpha"));
    await cas.creer(saisie("Zeta"));
    // Sans collation, MongoDB ordonne par point de code : « Zeta » (Z = 90) précède « alpha » (a = 97).
    // Un tri `localeCompare` donnerait l'ordre inverse : le faux en mémoire doit rester fidèle.
    expect((await cas.lister()).map((e) => e.nom)).toEqual(["Zeta", "alpha"]);
  });

  it("une équipe créée porte la révision 0 (`__v` d'un nouveau document)", async () => {
    const creee = await cas.creer(saisie("A"));
    expect(creee.revision).toBe(0);
  });

  it("crée puis obtient une équipe", async () => {
    const creee = await cas.creer({ nom: "A", membres: ["x", "y"], disponibilite: false });
    expect(await cas.obtenir(creee.id)).toMatchObject({ nom: "A", membres: ["x", "y"], disponibilite: false });
  });

  it("obtenir une équipe inconnue lève EquipeIntrouvable", async () => {
    await expect(cas.obtenir("inconnue")).rejects.toBeInstanceOf(EquipeIntrouvable);
  });

  it("modifie une équipe existante et refuse une équipe inconnue", async () => {
    const creee = await cas.creer(saisie("A"));
    expect((await cas.modifier(creee.id, saisie("B"))).nom).toBe("B");
    await expect(cas.modifier("inconnue", saisie("B"))).rejects.toBeInstanceOf(EquipeIntrouvable);
  });

  it("supprime une équipe libre", async () => {
    const creee = await cas.creer(saisie("A"));
    await cas.supprimer(creee.id);
    await expect(cas.obtenir(creee.id)).rejects.toBeInstanceOf(EquipeIntrouvable);
  });

  it("refuse de supprimer une équipe rattachée à des comptes, qui reste présente", async () => {
    const creee = await cas.creer(saisie("A"));
    rattachements.rattacher(creee.id);
    await expect(cas.supprimer(creee.id)).rejects.toBeInstanceOf(EquipeRattachee);
    expect(await cas.obtenir(creee.id)).toMatchObject({ nom: "A" });
  });

  it("supprimer une équipe inconnue lève EquipeIntrouvable", async () => {
    await expect(cas.supprimer("inconnue")).rejects.toBeInstanceOf(EquipeIntrouvable);
  });

  it("le rattachement est vérifié AVANT l'existence (même ordre que la route actuelle)", async () => {
    rattachements.rattacher("fantome");
    await expect(cas.supprimer("fantome")).rejects.toBeInstanceOf(EquipeRattachee);
  });
});
