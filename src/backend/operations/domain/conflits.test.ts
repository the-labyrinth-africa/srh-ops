import { describe, it, expect } from "vitest";
import {
  detecterConflits,
  fenetreDemandee,
  finPrevue,
  seChevauchent,
  type AffectationExistante,
} from "./conflits";

const MESSAGE_EQUIPE = "L'équipe est déjà affectée à une opération sur ce créneau";
const MESSAGE_VEHICULE = "Le véhicule est déjà affecté à une opération sur ce créneau";
const h = (heure: string) => new Date(`2026-10-01T${heure}:00Z`);

const existante = (surcharge: Partial<AffectationExistante> = {}): AffectationExistante => ({
  operationId: "op-1",
  dateHeurePrevue: h("08:00"),
  dureeEstimeeMinutes: 120,
  equipeId: "equipe-a",
  vehiculeId: "vehicule-a",
  ...surcharge,
});

describe("fenêtre et chevauchement", () => {
  it("finPrevue ajoute la durée en minutes", () => {
    expect(finPrevue(h("08:00"), 90)).toEqual(h("09:30"));
  });

  it("fenetreDemandee applique 120 minutes quand la durée est absente", () => {
    expect(fenetreDemandee({ dateHeurePrevue: h("08:00") })).toEqual({ debut: h("08:00"), fin: h("10:00") });
    expect(fenetreDemandee({ dateHeurePrevue: h("08:00"), dureeEstimeeMinutes: 30 }).fin).toEqual(h("08:30"));
  });

  it("deux créneaux bord à bord ne se chevauchent pas, dans les deux sens", () => {
    expect(seChevauchent(h("08:00"), h("10:00"), h("10:00"), h("12:00"))).toBe(false);
    expect(seChevauchent(h("10:00"), h("12:00"), h("08:00"), h("10:00"))).toBe(false);
    expect(seChevauchent(h("08:00"), h("10:00"), h("09:59"), h("12:00"))).toBe(true);
  });
});

describe("detecterConflits", () => {
  it("même opération sur l'équipe et le véhicule : deux entrées, équipe d'abord", () => {
    const conflits = detecterConflits(
      { dateHeurePrevue: h("09:00"), dureeEstimeeMinutes: 120, equipeId: "equipe-a", vehiculeId: "vehicule-a" },
      [existante()]
    );
    expect(conflits).toEqual([
      { hasConflict: true, message: MESSAGE_EQUIPE, conflictingOperationId: "op-1" },
      { hasConflict: true, message: MESSAGE_VEHICULE, conflictingOperationId: "op-1" },
    ]);
  });

  it("ne signale que la ressource réellement partagée", () => {
    const conflits = detecterConflits(
      { dateHeurePrevue: h("09:00"), equipeId: "equipe-b", vehiculeId: "vehicule-a" },
      [existante()]
    );
    expect(conflits).toEqual([{ hasConflict: true, message: MESSAGE_VEHICULE, conflictingOperationId: "op-1" }]);
  });

  it("suit l'ordre des opérations candidates", () => {
    const conflits = detecterConflits({ dateHeurePrevue: h("09:00"), equipeId: "equipe-a" }, [
      existante({ operationId: "op-2", vehiculeId: undefined }),
      existante({ operationId: "op-1", vehiculeId: undefined }),
    ]);
    expect(conflits.map((c) => c.conflictingOperationId)).toEqual(["op-2", "op-1"]);
  });

  it("ignore une candidate qui ne chevauche pas (bord à bord, avant ou après)", () => {
    expect(detecterConflits({ dateHeurePrevue: h("10:00"), equipeId: "equipe-a" }, [existante()])).toEqual([]);
    expect(
      detecterConflits({ dateHeurePrevue: h("06:00"), dureeEstimeeMinutes: 120, equipeId: "equipe-a" }, [existante()])
    ).toEqual([]);
  });

  it("une candidate sans durée (absente ou null) dure 120 minutes", () => {
    for (const dureeEstimeeMinutes of [undefined, null]) {
      const candidate = existante({ dureeEstimeeMinutes });
      expect(detecterConflits({ dateHeurePrevue: h("09:59"), equipeId: "equipe-a" }, [candidate])).toHaveLength(1);
      expect(detecterConflits({ dateHeurePrevue: h("10:00"), equipeId: "equipe-a" }, [candidate])).toEqual([]);
    }
  });

  it("une opération longue démarrée bien avant bloque encore le créneau", () => {
    const conflits = detecterConflits(
      { dateHeurePrevue: h("12:30"), dureeEstimeeMinutes: 60, equipeId: "equipe-a" },
      [existante({ dureeEstimeeMinutes: 300 })]
    );
    expect(conflits).toHaveLength(1);
  });

  it("une ressource vide n'est jamais en conflit", () => {
    expect(
      detecterConflits({ dateHeurePrevue: h("09:00"), equipeId: "", vehiculeId: undefined }, [
        existante({ equipeId: undefined, vehiculeId: undefined }),
      ])
    ).toEqual([]);
  });
});
