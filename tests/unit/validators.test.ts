import { describe, it, expect } from "vitest";
import { clientSchema } from "@/lib/validators/client";
import { siteSchema } from "@/lib/validators/site";
import { equipeSchema } from "@/lib/validators/equipe";
import { vehiculeSchema } from "@/lib/validators/vehicule";
import { equipementSchema } from "@/lib/validators/equipement";
import { operationSchema, statusUpdateSchema } from "@/lib/validators/operation";

describe("Zod Validators (lib/validators/*)", () => {
  describe("clientSchema", () => {
    it("should validate a valid client", () => {
      const result = clientSchema.safeParse({
        nom: "Client BioMed",
        contact: { telephone: "+22507000000", email: "contact@biomed.ci" },
      });
      expect(result.success).toBe(true);
    });

    it("should fail validation if client name is empty", () => {
      const result = clientSchema.safeParse({
        nom: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("siteSchema", () => {
    it("should validate a valid site", () => {
      const result = siteSchema.safeParse({
        clientId: "507f1f77bcf86cd799439011",
        nom: "Site Abidjan Port",
        adresse: "Zone Industrielle Yopougon",
        typeDechets: ["SRH Toxiques"],
        observations: "Accès poids lourds",
      });
      expect(result.success).toBe(true);
    });

    it("should fail site validation if clientId or nom is missing", () => {
      const result = siteSchema.safeParse({
        clientId: "",
        nom: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("equipeSchema", () => {
    it("should validate a valid team", () => {
      const result = equipeSchema.safeParse({
        nom: "Équipe Alfa",
        membres: ["Jean Dupont", "Marc Koffi"],
        disponibilite: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("vehiculeSchema", () => {
    it("should validate a valid vehicle", () => {
      const result = vehiculeSchema.safeParse({
        identification: "1234-AB-01",
        type: "Camion Benne",
        capacite: 15,
        disponibilite: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("equipementSchema", () => {
    it("should validate a valid equipment", () => {
      const result = equipementSchema.safeParse({
        nom: "Compacteur SRH-01",
        type: "Compacteur",
        disponibilite: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("operationSchema", () => {
    it("should validate a valid operation input", () => {
      const result = operationSchema.safeParse({
        clientId: "507f1f77bcf86cd799439011",
        siteId: "507f1f77bcf86cd799439012",
        natureIntervention: "Collecte SRH Médical",
        dateHeurePrevue: "2026-09-10T10:00:00Z",
        dureeEstimeeMinutes: 120,
        equipeId: "507f1f77bcf86cd799439013",
        vehiculeId: "507f1f77bcf86cd799439014",
        equipementIds: ["507f1f77bcf86cd799439015"],
        informationsParticulieres: "EPI requis",
      });
      expect(result.success).toBe(true);
    });

    it("should reject operation without clientId or siteId or natureIntervention", () => {
      const result = operationSchema.safeParse({
        clientId: "",
        siteId: "",
        natureIntervention: "",
        dateHeurePrevue: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("statusUpdateSchema", () => {
    it("should accept valid status enum values", () => {
      expect(statusUpdateSchema.safeParse({ statut: "Planifiée" }).success).toBe(true);
      expect(statusUpdateSchema.safeParse({ statut: "En cours" }).success).toBe(true);
      expect(statusUpdateSchema.safeParse({ statut: "Terminée" }).success).toBe(true);
    });

    it("should reject invalid status value", () => {
      expect(statusUpdateSchema.safeParse({ statut: "InvalidStatus" }).success).toBe(false);
    });
  });
});
