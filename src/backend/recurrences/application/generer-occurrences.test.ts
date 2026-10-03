import { describe, it, expect, beforeEach } from "vitest";
import type { ConflitDetecte, OccurrenceACreer } from "../domain/ports";
import type { RecurrencePlanifiable } from "../domain/recurrence";
import { RecurrenceRepositoryEnMemoire } from "../infrastructure/en-memoire/recurrence.repository.en-memoire";
import { creerGenerationOccurrences } from "./generer-occurrences";

// Heure locale, comme le calcul des occurrences.
const MAINTENANT = new Date(2030, 10, 4, 9, 0, 0, 0);
const jour = (j: number) => new Date(2030, 10, j, 8, 0, 0, 0);
const DEMAIN = (MAINTENANT.getDay() + 1) % 7;

const recurrence = (surcharge: Partial<RecurrencePlanifiable> = {}): RecurrencePlanifiable => ({
  id: "rec-1",
  clientId: "client-a",
  siteId: "site-a",
  natureIntervention: "Collecte",
  frequence: "hebdomadaire",
  jourSemaine: DEMAIN,
  heurePrevue: "08:00",
  createdAt: new Date(2030, 9, 1),
  ...surcharge,
});

describe("génération des occurrences de récurrences", () => {
  let recurrences: RecurrenceRepositoryEnMemoire;
  let creees: { occurrence: OccurrenceACreer; parUtilisateur: string }[];
  let dejaPresentes: Set<string>;
  let conflitsPar: (demande: { equipeId?: string; vehiculeId?: string; dateHeurePrevue: Date }) => ConflitDetecte[];
  let demandes: unknown[];
  let generer: ReturnType<typeof creerGenerationOccurrences>;

  const cle = (clientId: string, siteId: string, date: Date) => `${clientId}|${siteId}|${date.getTime()}`;

  beforeEach(() => {
    recurrences = new RecurrenceRepositoryEnMemoire();
    creees = [];
    dejaPresentes = new Set();
    conflitsPar = () => [];
    demandes = [];
    generer = creerGenerationOccurrences({
      recurrences,
      operations: {
        existeSurCreneau: async (clientId, siteId, date) => dejaPresentes.has(cle(clientId, siteId, date)),
        verifierConflits: async (demande) => {
          demandes.push(demande);
          return conflitsPar(demande);
        },
        creer: async (occurrence, parUtilisateur) => {
          creees.push({ occurrence, parUtilisateur });
        },
      },
      horloge: { maintenant: () => MAINTENANT },
    });
  });

  it("aucune récurrence active : rien n'est généré", async () => {
    expect(await generer("u-admin", 7)).toEqual({ generatedCount: 0, conflits: [] });
  });

  it("crée une opération par occurrence, avec les ressources et les valeurs par défaut de la récurrence", async () => {
    recurrences.actives = [recurrence({ equipeId: "equipe-a", vehiculeId: "vehicule-a" })];

    const resultat = await generer("u-admin", 14);

    expect(resultat).toEqual({ generatedCount: 2, conflits: [] });
    expect(creees).toEqual([
      {
        parUtilisateur: "u-admin",
        occurrence: {
          clientId: "client-a",
          siteId: "site-a",
          natureIntervention: "Collecte",
          dateHeurePrevue: jour(5),
          dureeEstimeeMinutes: 120,
          equipeId: "equipe-a",
          vehiculeId: "vehicule-a",
          equipementIds: [],
          informationsParticulieres: "",
        },
      },
      expect.objectContaining({ occurrence: expect.objectContaining({ dateHeurePrevue: jour(12) }) }),
    ]);
    expect(demandes[0]).toEqual({
      dateHeurePrevue: jour(5),
      dureeEstimeeMinutes: 120,
      equipeId: "equipe-a",
      vehiculeId: "vehicule-a",
    });
  });

  it("reprend la durée, les équipements et les informations de la récurrence quand ils existent", async () => {
    recurrences.actives = [
      recurrence({ dureeEstimeeMinutes: 45, equipementIds: ["equipement-a"], informationsParticulieres: "Badge" }),
    ];
    await generer("u-admin", 7);
    expect(creees[0].occurrence).toMatchObject({
      dureeEstimeeMinutes: 45,
      equipementIds: ["equipement-a"],
      informationsParticulieres: "Badge",
    });
  });

  it("opération déjà présente sur le créneau : ignorée, ni conflit cherché ni création", async () => {
    recurrences.actives = [recurrence()];
    dejaPresentes.add(cle("client-a", "site-a", jour(5)));

    expect(await generer("u-admin", 7)).toEqual({ generatedCount: 0, conflits: [] });
    expect(demandes).toEqual([]);
    expect(creees).toEqual([]);
    expect(recurrences.ancres).toEqual([]);
  });

  it("ressource en conflit : opération créée sans équipe ni véhicule, conflit signalé (messages joints)", async () => {
    recurrences.actives = [recurrence({ equipeId: "equipe-a", vehiculeId: "vehicule-a" })];
    conflitsPar = () => [
      { hasConflict: true, message: "L'équipe est déjà affectée à une opération sur ce créneau" },
      { hasConflict: false, message: "ignoré" },
      { hasConflict: true },
      { hasConflict: true, message: "Le véhicule est déjà affecté à une opération sur ce créneau" },
    ];

    const resultat = await generer("u-admin", 7);

    expect(resultat).toEqual({
      generatedCount: 1,
      conflits: [
        {
          recurrenceId: "rec-1",
          date: jour(5).toISOString(),
          message:
            "L'équipe est déjà affectée à une opération sur ce créneau ; Le véhicule est déjà affecté à une opération sur ce créneau",
        },
      ],
    });
    expect(creees[0].occurrence.equipeId).toBeUndefined();
    expect(creees[0].occurrence.vehiculeId).toBeUndefined();
  });

  it("résultats sans conflit effectif : les ressources sont conservées", async () => {
    recurrences.actives = [recurrence({ equipeId: "equipe-a" })];
    conflitsPar = () => [{ hasConflict: false }];
    expect((await generer("u-admin", 7)).conflits).toEqual([]);
    expect(creees[0].occurrence.equipeId).toBe("equipe-a");
  });

  it("l'ancre avance à la dernière occurrence créée, une fois par récurrence ; jamais si rien n'est créé", async () => {
    recurrences.actives = [recurrence(), recurrence({ id: "rec-2", siteId: "site-b" })];
    dejaPresentes.add(cle("client-a", "site-b", jour(5)));
    dejaPresentes.add(cle("client-a", "site-b", jour(12)));

    expect((await generer("u-admin", 14)).generatedCount).toBe(2);
    expect(recurrences.ancres).toEqual([{ id: "rec-1", derniereGeneration: jour(12) }]);
  });

  it("horizon invalide (NaN) : aucune occurrence calendaire", async () => {
    recurrences.actives = [recurrence()];
    expect(await generer("u-admin", NaN)).toEqual({ generatedCount: 0, conflits: [] });
  });
});
