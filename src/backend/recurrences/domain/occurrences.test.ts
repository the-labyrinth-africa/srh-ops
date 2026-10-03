import { describe, it, expect } from "vitest";
import { MAX_OCCURRENCES_SCAN, finHorizon, horizonEnJours, occurrencesDe } from "./occurrences";
import type { RecurrencePlanifiable } from "./recurrence";

// Toutes les dates sont construites en heure locale : le calcul d'origine travaille en heure locale.
const MAINTENANT = new Date(2030, 10, 4, 9, 0, 0, 0); // 4 novembre 2030, 09:00
const jour = (j: number, h = 8, m = 0) => new Date(2030, 10, j, h, m, 0, 0);

const recurrence = (surcharge: Partial<RecurrencePlanifiable> = {}): RecurrencePlanifiable => ({
  id: "rec-1",
  clientId: "client-a",
  siteId: "site-a",
  natureIntervention: "Collecte",
  frequence: "hebdomadaire",
  heurePrevue: "08:00",
  createdAt: new Date(2030, 9, 1, 12, 0),
  ...surcharge,
});

describe("horizonEnJours", () => {
  it.each([
    [undefined, 30],
    [0, 30],
    [12, 12],
    ["12", 12],
    [500, 90],
    [-5, 1],
  ])("%j → %i", (valeur, attendu) => {
    expect(horizonEnJours(valeur)).toBe(attendu);
  });

  it.each(["abc", NaN, {}, [], "12 jours", null, ""])("valeur non numérique %j : horizon par défaut", (valeur) => {
    expect(horizonEnJours(valeur)).toBe(30);
  });
});

describe("finHorizon", () => {
  it("ajoute le nombre de jours à l'instant présent", () => {
    expect(finHorizon(MAINTENANT, 7)).toEqual(new Date(2030, 10, 11, 9, 0, 0, 0));
  });

  it("horizon NaN : date invalide", () => {
    expect(Number.isNaN(finHorizon(MAINTENANT, NaN).getTime())).toBe(true);
  });
});

describe("occurrencesDe — hebdomadaire", () => {
  const demain = (MAINTENANT.getDay() + 1) % 7;

  it("une occurrence par semaine, à l'heure prévue", () => {
    const rec = recurrence({ jourSemaine: demain });
    expect(occurrencesDe(rec, MAINTENANT, finHorizon(MAINTENANT, 7))).toEqual([jour(5)]);
    expect(occurrencesDe(rec, MAINTENANT, finHorizon(MAINTENANT, 14))).toEqual([jour(5), jour(12)]);
  });

  it("le jour même : exclue si l'heure est passée, incluse sinon", () => {
    const aujourdHui = MAINTENANT.getDay();
    expect(
      occurrencesDe(recurrence({ jourSemaine: aujourdHui, heurePrevue: "08:00" }), MAINTENANT, finHorizon(MAINTENANT, 7))
    ).toEqual([jour(11)]);
    expect(
      occurrencesDe(recurrence({ jourSemaine: aujourdHui, heurePrevue: "10:30" }), MAINTENANT, finHorizon(MAINTENANT, 6))
    ).toEqual([jour(4, 10, 30)]);
    expect(
      occurrencesDe(recurrence({ jourSemaine: aujourdHui, heurePrevue: "09:00" }), MAINTENANT, finHorizon(MAINTENANT, 6))
    ).toEqual([jour(4, 9, 0)]);
  });

  it("jour de semaine absent : aucune occurrence", () => {
    expect(occurrencesDe(recurrence(), MAINTENANT, finHorizon(MAINTENANT, 30))).toEqual([]);
  });

  it("heure prévue absente : 08:00", () => {
    const rec = recurrence({ jourSemaine: demain, heurePrevue: undefined });
    expect(occurrencesDe(rec, MAINTENANT, finHorizon(MAINTENANT, 7))).toEqual([jour(5)]);
  });
});

describe("occurrencesDe — mensuelle", () => {
  it("le jour du mois demandé, chaque mois de l'horizon", () => {
    const rec = recurrence({ frequence: "mensuelle", jourMois: 15 });
    expect(occurrencesDe(rec, MAINTENANT, finHorizon(MAINTENANT, 30))).toEqual([jour(15)]);
    expect(occurrencesDe(rec, MAINTENANT, finHorizon(MAINTENANT, 60))).toEqual([
      jour(15),
      new Date(2030, 11, 15, 8, 0, 0, 0),
    ]);
  });

  it("jour du mois absent : aucune occurrence", () => {
    expect(occurrencesDe(recurrence({ frequence: "mensuelle" }), MAINTENANT, finHorizon(MAINTENANT, 60))).toEqual([]);
  });
});

describe("occurrencesDe — personnalisée", () => {
  it("ancre = dernière occurrence générée ; les rangs passés sont ignorés, l'ancre ne glisse pas", () => {
    const rec = recurrence({ frequence: "personnalisee", intervalleJours: 3, derniereGeneration: jour(1) });
    expect(occurrencesDe(rec, MAINTENANT, finHorizon(MAINTENANT, 10))).toEqual([jour(7), jour(10), jour(13)]);
  });

  it("sans dernière génération : ancre = création ; intervalle absent : 7 jours", () => {
    const rec = recurrence({ frequence: "personnalisee", createdAt: new Date(2030, 10, 2, 15, 0) });
    expect(occurrencesDe(rec, MAINTENANT, finHorizon(MAINTENANT, 14))).toEqual([jour(9), jour(16)]);
  });

  it("récurrence dormante depuis des années : reprise sans épuiser la borne de sécurité", () => {
    const rec = recurrence({
      frequence: "personnalisee",
      intervalleJours: 1,
      derniereGeneration: new Date(2020, 0, 1, 8, 0),
    });
    const occurrences = occurrencesDe(rec, MAINTENANT, finHorizon(MAINTENANT, 3));
    expect(occurrences).toEqual([jour(5), jour(6), jour(7)]);
  });
});

describe("occurrencesDe — horizon invalide (date de fin invalide)", () => {
  it.each(["hebdomadaire", "mensuelle"] as const)("%s : aucune occurrence", (frequence) => {
    const rec = recurrence({ frequence, jourSemaine: 1, jourMois: 5 });
    expect(occurrencesDe(rec, MAINTENANT, finHorizon(MAINTENANT, NaN))).toEqual([]);
  });

  // Sans date de fin valide, rien n'arrêterait le parcours d'une récurrence personnalisée avant
  // la borne de sécurité (jusqu'à 1000 opérations créées d'un coup) : aucune occurrence.
  it("personnalisée : aucune occurrence non plus", () => {
    const rec = recurrence({ frequence: "personnalisee", intervalleJours: 1, derniereGeneration: jour(1) });
    expect(occurrencesDe(rec, MAINTENANT, finHorizon(MAINTENANT, NaN))).toEqual([]);
  });

  it("la borne de sécurité limite toujours le parcours d'un horizon démesuré", () => {
    const rec = recurrence({ frequence: "personnalisee", intervalleJours: 1, derniereGeneration: jour(1) });
    const occurrences = occurrencesDe(rec, MAINTENANT, finHorizon(MAINTENANT, 100_000));
    expect(occurrences.length).toBeLessThanOrEqual(MAX_OCCURRENCES_SCAN);
  });
});
