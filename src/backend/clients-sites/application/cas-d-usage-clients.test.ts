import { describe, it, expect, beforeEach } from "vitest";
import { creerCasDUsageClients } from "./cas-d-usage-clients";
import { ClientIntrouvable, ClientRattache } from "../domain/erreurs";
import { ClientRepositoryEnMemoire } from "../infrastructure/en-memoire/client.repository.en-memoire";
import type { RattachementsUtilisateurs } from "../domain/ports";

const rattachementsAucun: RattachementsUtilisateurs = { existePourClient: async () => false };
const rattachementsPresent: RattachementsUtilisateurs = { existePourClient: async () => true };
const saisie = (nom: string) => ({ nom, contact: { telephone: "", email: "" } });

let clients: ClientRepositoryEnMemoire;

beforeEach(() => {
  clients = new ClientRepositoryEnMemoire();
});

describe("cas d'usage des clients", () => {
  it("liste les clients triés par nom (ordre binaire), filtrés par idClient si fourni", async () => {
    const cas = creerCasDUsageClients({ clients, rattachements: rattachementsAucun });
    await cas.creer(saisie("Beta"));
    const alpha = await cas.creer(saisie("Alpha"));
    expect((await cas.lister()).map((c) => c.nom)).toEqual(["Alpha", "Beta"]);
    expect((await cas.lister(alpha.id)).map((c) => c.nom)).toEqual(["Alpha"]);
  });

  it("crée puis obtient un client avec sa révision initiale", async () => {
    const cas = creerCasDUsageClients({ clients, rattachements: rattachementsAucun });
    const cree = await cas.creer(saisie("Alpha"));
    expect(cree.revision).toBe(0);
    expect(await cas.obtenir(cree.id)).toMatchObject({ nom: "Alpha" });
  });

  it("obtenir un client inconnu lève ClientIntrouvable", async () => {
    const cas = creerCasDUsageClients({ clients, rattachements: rattachementsAucun });
    await expect(cas.obtenir("inconnu")).rejects.toBeInstanceOf(ClientIntrouvable);
  });

  it("modifie un client existant et refuse un client inconnu", async () => {
    const cas = creerCasDUsageClients({ clients, rattachements: rattachementsAucun });
    const cree = await cas.creer(saisie("Alpha"));
    expect((await cas.modifier(cree.id, saisie("Alpha modifié"))).nom).toBe("Alpha modifié");
    await expect(cas.modifier("inconnu", saisie("X"))).rejects.toBeInstanceOf(ClientIntrouvable);
  });

  it("refuse de supprimer un client rattaché à des comptes (ClientRattache), sans le retirer", async () => {
    const cas = creerCasDUsageClients({ clients, rattachements: rattachementsPresent });
    const cree = await cas.creer(saisie("Alpha"));
    await expect(cas.supprimer(cree.id)).rejects.toBeInstanceOf(ClientRattache);
    expect(await cas.obtenir(cree.id)).toMatchObject({ nom: "Alpha" });
  });

  it("supprime un client sans compte rattaché et refuse un client inconnu", async () => {
    const cas = creerCasDUsageClients({ clients, rattachements: rattachementsAucun });
    const cree = await cas.creer(saisie("Alpha"));
    await cas.supprimer(cree.id);
    await expect(cas.obtenir(cree.id)).rejects.toBeInstanceOf(ClientIntrouvable);
    await expect(cas.supprimer(cree.id)).rejects.toBeInstanceOf(ClientIntrouvable);
  });
});
