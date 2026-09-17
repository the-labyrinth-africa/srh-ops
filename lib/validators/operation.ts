import { z } from "zod";
import { OPERATION_STATUSES, QUANTITE_UNITES } from "@/types";

export const operationSchema = z.object({
  clientId: z.string().min(1, "Client requis"),
  siteId: z.string().min(1, "Site requis"),
  natureIntervention: z.string().min(1, "Nature requise"),
  dateHeurePrevue: z.string().min(1, "Date/heure requise"),
  dureeEstimeeMinutes: z.coerce.number().min(30).optional().default(120),
  equipeId: z.string().optional(),
  vehiculeId: z.string().optional(),
  equipementIds: z.array(z.string()).optional().default([]),
  informationsParticulieres: z.string().optional().default(""),
  statut: z.enum(OPERATION_STATUSES as [string, ...string[]]).optional(),
  quantiteCollectee: z.coerce.number().min(0).optional(),
  uniteQuantite: z.enum(QUANTITE_UNITES as [string, ...string[]]).optional().default("Litres"),
  remarquesTerrain: z.string().optional().default(""),
  nomSignataireClient: z.string().optional().default(""),
  signatureClient: z.string().optional().default(""),
});

export const statusUpdateSchema = z.object({
  statut: z.enum(OPERATION_STATUSES as [string, ...string[]]),
  quantiteCollectee: z.coerce.number().min(0).optional(),
  uniteQuantite: z.enum(QUANTITE_UNITES as [string, ...string[]]).optional(),
  remarquesTerrain: z.string().optional(),
  nomSignataireClient: z.string().optional(),
  signatureClient: z.string().optional(),
  photos: z
    .array(
      z.object({
        url: z.string(),
        nom: z.string().optional(),
      })
    )
    .optional(),
});

export type OperationInput = z.infer<typeof operationSchema>;
