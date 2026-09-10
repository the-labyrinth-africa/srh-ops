import { describe, it, expect } from "vitest";
import {
  canTransition,
  getNextStatuses,
  computeEffectiveStatus,
} from "@/lib/status-transitions";

describe("Status Transition & Logic (lib/status-transitions.ts)", () => {
  describe("canTransition", () => {
    it("should allow identity transition (same status)", () => {
      expect(canTransition("Planifiée", "Planifiée")).toBe(true);
      expect(canTransition("En cours", "En cours")).toBe(true);
    });

    it("should allow valid forward transitions according to state machine", () => {
      expect(canTransition("Planifiée", "Affectée")).toBe(true);
      expect(canTransition("Planifiée", "Annulée")).toBe(true);
      expect(canTransition("Affectée", "En route")).toBe(true);
      expect(canTransition("En route", "En cours")).toBe(true);
      expect(canTransition("En cours", "Terminée")).toBe(true);
      expect(canTransition("Terminée", "Rapportée")).toBe(true);
    });

    it("should allow Retardée recovery transitions", () => {
      expect(canTransition("Retardée", "En route")).toBe(true);
      expect(canTransition("Retardée", "En cours")).toBe(true);
      expect(canTransition("Retardée", "Terminée")).toBe(true);
      expect(canTransition("Retardée", "Annulée")).toBe(true);
    });

    it("should deny invalid transitions", () => {
      expect(canTransition("Rapportée", "Planifiée")).toBe(false);
      expect(canTransition("Annulée", "Terminée")).toBe(false);
      expect(canTransition("Terminée", "En cours")).toBe(false);
      expect(canTransition("Planifiée", "Terminée")).toBe(false);
    });
  });

  describe("getNextStatuses", () => {
    it("should return the correct list of next allowed statuses", () => {
      expect(getNextStatuses("Planifiée")).toEqual(["Affectée", "Annulée", "Retardée"]);
      expect(getNextStatuses("Terminée")).toEqual(["Rapportée"]);
      expect(getNextStatuses("Rapportée")).toEqual([]);
      expect(getNextStatuses("Annulée")).toEqual([]);
    });
  });

  describe("computeEffectiveStatus", () => {
    it("should return Retardée if scheduled date is in the past and status is active", () => {
      const pastDate = new Date(Date.now() - 3600 * 1000); // 1 hour ago
      expect(computeEffectiveStatus("Planifiée", pastDate)).toBe("Retardée");
      expect(computeEffectiveStatus("Affectée", pastDate)).toBe("Retardée");
      expect(computeEffectiveStatus("En route", pastDate)).toBe("Retardée");
      expect(computeEffectiveStatus("En cours", pastDate)).toBe("Retardée");
    });

    it("should preserve scheduled status if date is in the future", () => {
      const futureDate = new Date(Date.now() + 3600 * 1000); // 1 hour in future
      expect(computeEffectiveStatus("Planifiée", futureDate)).toBe("Planifiée");
      expect(computeEffectiveStatus("Affectée", futureDate)).toBe("Affectée");
    });

    it("should preserve terminal statuses even if past date", () => {
      const pastDate = new Date(Date.now() - 3600 * 1000);
      expect(computeEffectiveStatus("Terminée", pastDate)).toBe("Terminée");
      expect(computeEffectiveStatus("Rapportée", pastDate)).toBe("Rapportée");
      expect(computeEffectiveStatus("Annulée", pastDate)).toBe("Annulée");
    });
  });
});
