import { z } from "zod";
import { OPERATION_STATUSES } from "@/types";

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
});

export const statusUpdateSchema = z.object({
  statut: z.enum(OPERATION_STATUSES as [string, ...string[]]),
});

export type OperationInput = z.infer<typeof operationSchema>;
