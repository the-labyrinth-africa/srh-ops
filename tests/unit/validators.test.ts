import { describe, it, expect } from "vitest";
import { clientSchema } from "@/backend/clients-sites/http/client.schema";
import { siteSchema } from "@/backend/clients-sites/http/site.schema";
import { equipeSchema } from "@/backend/equipes/http/equipe.schema";
import { vehiculeSchema } from "@/backend/vehicules/http/vehicule.schema";
import { equipementSchema } from "@/backend/equipements/http/equipement.schema";
import { operationSchema, statusUpdateSchema } from "@/lib/validators/operation";
import { recurrenceSchema } from "@/lib/validators/recurrence";

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

    it("should reject malformed ObjectId strings (I11)", () => {
      const base = {
        clientId: "507f1f77bcf86cd799439011",
        siteId: "507f1f77bcf86cd799439012",
        natureIntervention: "Collecte",
        dateHeurePrevue: "2026-09-10T10:00:00Z",
      };

      expect(operationSchema.safeParse({ ...base, clientId: "not-an-id" }).success).toBe(false);
      expect(operationSchema.safeParse({ ...base, siteId: "123" }).success).toBe(false);
      expect(operationSchema.safeParse({ ...base, equipeId: "oops" }).success).toBe(false);
      expect(operationSchema.safeParse({ ...base, vehiculeId: "oops" }).success).toBe(false);
      expect(operationSchema.safeParse({ ...base, equipementIds: ["oops"] }).success).toBe(false);
    });

    it("should still treat an empty optional id as « non renseigné » (I11)", () => {
      const result = operationSchema.safeParse({
        clientId: "507f1f77bcf86cd799439011",
        siteId: "507f1f77bcf86cd799439012",
        natureIntervention: "Collecte",
        dateHeurePrevue: "2026-09-10T10:00:00Z",
        equipeId: "",
        vehiculeId: "",
      });
      expect(result.success).toBe(true);
    });

    it("should reject a zero or negative collected quantity (I5)", () => {
      const base = {
        clientId: "507f1f77bcf86cd799439011",
        siteId: "507f1f77bcf86cd799439012",
        natureIntervention: "Collecte",
        dateHeurePrevue: "2026-09-10T10:00:00Z",
      };

      expect(operationSchema.safeParse({ ...base, quantiteCollectee: 0 }).success).toBe(false);
      expect(operationSchema.safeParse({ ...base, quantiteCollectee: -5 }).success).toBe(false);
      expect(operationSchema.safeParse({ ...base, quantiteCollectee: 1 }).success).toBe(true);
      expect(operationSchema.safeParse(base).success).toBe(true);
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

    it("should reject a zero or negative collected quantity (I5)", () => {
      expect(statusUpdateSchema.safeParse({ statut: "Terminée", quantiteCollectee: 0 }).success).toBe(false);
      expect(statusUpdateSchema.safeParse({ statut: "Terminée", quantiteCollectee: -1 }).success).toBe(false);
      expect(statusUpdateSchema.safeParse({ statut: "Terminée", quantiteCollectee: 850 }).success).toBe(true);
      expect(statusUpdateSchema.safeParse({ statut: "Terminée" }).success).toBe(true);
    });
  });

  describe("recurrenceSchema", () => {
    const base = {
      clientId: "507f1f77bcf86cd799439011",
      siteId: "507f1f77bcf86cd799439012",
      natureIntervention: "Collecte hebdomadaire",
      frequence: "hebdomadaire" as const,
      jourSemaine: 1,
    };

    it("should validate a valid recurrence", () => {
      expect(recurrenceSchema.safeParse(base).success).toBe(true);
    });

    it("should reject malformed ObjectId strings (I11)", () => {
      expect(recurrenceSchema.safeParse({ ...base, clientId: "nope" }).success).toBe(false);
      expect(recurrenceSchema.safeParse({ ...base, siteId: "507f1f77" }).success).toBe(false);
      expect(recurrenceSchema.safeParse({ ...base, equipeId: "nope" }).success).toBe(false);
      expect(recurrenceSchema.safeParse({ ...base, vehiculeId: "nope" }).success).toBe(false);
      expect(recurrenceSchema.safeParse({ ...base, equipementIds: ["nope"] }).success).toBe(false);
    });

    it("should still treat an empty optional id as « non renseigné » (I11)", () => {
      expect(
        recurrenceSchema.safeParse({ ...base, equipeId: "", vehiculeId: "" }).success
      ).toBe(true);
    });
  });
});
