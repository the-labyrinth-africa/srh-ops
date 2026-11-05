import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { listerStationsShell, prevoirCollectes } from "./collectes";

describe("prévisions de collecte", () => {
  it("répartit l'objectif configurable sur les 40 stations et utilise les ressources disponibles", async () => {
    const stations = listerStationsShell();
    const previsions = await prevoirCollectes(
      "2026-11",
      [],
      2000,
      [{ id: "vehicule-1", nom: "Camion citerne", capacite: 100_000 }],
      [{ id: "equipement-1", nom: "Pompe" }]
    );

    expect(stations).toHaveLength(40);
    expect(new Set(previsions.map((ligne) => ligne.site)).size).toBe(40);
    expect(previsions.reduce((total, ligne) => total + (ligne.quantiteEstimeeLitres ?? 0), 0)).toBe(80_000);
    expect(previsions.every((ligne) => ligne.vehicule === "Camion citerne")).toBe(true);
    expect(previsions.every((ligne) => ligne.equipements.includes("Pompe"))).toBe(true);
  });

  it("recalcule le volume total lorsque l'objectif par station change", async () => {
    const previsions = await prevoirCollectes("2026-11", [], 1500);

    expect(previsions.reduce((total, ligne) => total + (ligne.quantiteEstimeeLitres ?? 0), 0)).toBe(60_000);
  });

  it("fractionne les objectifs pour respecter la capacité du camion de 1 000 L", async () => {
    const previsions = await prevoirCollectes("2026-11", [], 2000, [
      { id: "temp-1000", nom: "TEMP-1000L", capacite: 1000 },
      { id: "v-012", nom: "V-012", capacite: 5000 },
    ]);
    const volumesParTournee = new Map<string, number>();
    for (const ligne of previsions) {
      const cle = `${ligne.datePrevue}::${ligne.tournee}`;
      volumesParTournee.set(cle, (volumesParTournee.get(cle) ?? 0) + (ligne.quantiteEstimeeLitres ?? 0));
    }

    expect(previsions.reduce((total, ligne) => total + (ligne.quantiteEstimeeLitres ?? 0), 0)).toBe(80_000);
    expect(new Set(previsions.map((ligne) => ligne.vehicule)).size).toBe(2);
    expect(previsions.some((ligne) => ligne.vehicule === "TEMP-1000L")).toBe(true);
    expect(previsions.some((ligne) => ligne.vehicule === "V-012")).toBe(true);
    expect([...volumesParTournee.values()].every((volume) => volume <= 5000)).toBe(true);
    expect(previsions.every((ligne) => (ligne.capaciteVehiculeLitres ?? 0) >= (volumesParTournee.get(`${ligne.datePrevue}::${ligne.tournee}`) ?? 0))).toBe(true);
    expect([...new Set(previsions.map((ligne) => ligne.tournee))].every((tournee) =>
      new Set(previsions.filter((ligne) => ligne.tournee === tournee).map((ligne) => ligne.site)).size >= 5
    )).toBe(true);
  });

  it("crée plusieurs passages quand le camion de 1 000 L est le seul véhicule disponible", async () => {
    const previsions = await prevoirCollectes("2026-11", [], 2000, [
      { id: "petit", nom: "Camion 1 000 L", capacite: 1000 },
    ]);
    const volumesParTournee = new Map<string, number>();
    for (const ligne of previsions) {
      const cle = `${ligne.datePrevue}::${ligne.tournee}`;
      volumesParTournee.set(cle, (volumesParTournee.get(cle) ?? 0) + (ligne.quantiteEstimeeLitres ?? 0));
    }

    expect(previsions).toHaveLength(400);
    expect([...volumesParTournee.values()].every((volume) => volume <= 1000)).toBe(true);
    expect(previsions.every((ligne) => ligne.vehicule === "Camion 1 000 L" && ligne.capaciteVehiculeLitres === 1000)).toBe(true);
    expect([...new Set(previsions.map((ligne) => ligne.tournee))].every((tournee) =>
      new Set(previsions.filter((ligne) => ligne.tournee === tournee).map((ligne) => ligne.site)).size >= 5
    )).toBe(true);
  });

  it("estime la durée de station depuis les heures réelles d'arrivée et de départ", async () => {
    const [station] = listerStationsShell();
    const arrivee = new Date("2026-10-12T08:00:00.000Z");
    const previsions = await prevoirCollectes("2026-11", [
      {
        site: station.site,
        date: new Date("2026-10-12T08:00:00.000Z"),
        quantite: 400,
        dateHeureArrivee: arrivee,
        dateHeureDepart: new Date(arrivee.getTime() + 45 * 60_000),
      },
    ]);
    const visitesStation = previsions.filter((ligne) => ligne.site === station.site);

    expect(visitesStation.length).toBeGreaterThan(0);
    expect(visitesStation.every((ligne) => ligne.dureeEstimeeMinutes === 45)).toBe(true);
  });
});
