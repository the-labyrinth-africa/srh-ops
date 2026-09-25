import { describe, it, expect, beforeEach } from "vitest";
import { creerCasDUsageSites } from "./cas-d-usage-sites";
import { SiteIntrouvable } from "../domain/erreurs";
import { SiteRepositoryEnMemoire } from "../infrastructure/en-memoire/site.repository.en-memoire";

let sites: SiteRepositoryEnMemoire;
const saisie = (clientId: string, nom: string) => ({ clientId, nom, adresse: "", typeDechets: [], observations: "" });

beforeEach(() => {
  sites = new SiteRepositoryEnMemoire();
});

describe("cas d'usage des sites", () => {
  it("liste les sites triés par nom, filtrés par clientId si fourni", async () => {
    const cas = creerCasDUsageSites({ sites });
    await cas.creer(saisie("c1", "Beta"));
    await cas.creer(saisie("c2", "Alpha"));
    expect((await cas.lister()).map((s) => s.nom)).toEqual(["Alpha", "Beta"]);
    expect((await cas.lister("c1")).map((s) => s.nom)).toEqual(["Beta"]);
  });

  it("crée sans vérifier l'existence du client, puis obtient un site avec sa révision initiale", async () => {
    const cas = creerCasDUsageSites({ sites });
    const cree = await cas.creer(saisie("client-inexistant", "Alpha"));
    expect(cree.revision).toBe(0);
    expect(await cas.obtenir(cree.id)).toMatchObject({ nom: "Alpha" });
  });

  it("obtenir un site inconnu lève SiteIntrouvable", async () => {
    const cas = creerCasDUsageSites({ sites });
    await expect(cas.obtenir("inconnu")).rejects.toBeInstanceOf(SiteIntrouvable);
  });

  it("modifie un site existant et refuse un site inconnu", async () => {
    const cas = creerCasDUsageSites({ sites });
    const cree = await cas.creer(saisie("c1", "Alpha"));
    expect((await cas.modifier(cree.id, saisie("c1", "Alpha modifié"))).nom).toBe("Alpha modifié");
    await expect(cas.modifier("inconnu", saisie("c1", "X"))).rejects.toBeInstanceOf(SiteIntrouvable);
  });

  it("supprime un site sans aucun contrôle de rattachement et refuse un site inconnu", async () => {
    const cas = creerCasDUsageSites({ sites });
    const cree = await cas.creer(saisie("c1", "Alpha"));
    await cas.supprimer(cree.id);
    await expect(cas.obtenir(cree.id)).rejects.toBeInstanceOf(SiteIntrouvable);
    await expect(cas.supprimer(cree.id)).rejects.toBeInstanceOf(SiteIntrouvable);
  });
});
