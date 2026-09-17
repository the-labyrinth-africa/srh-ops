import { z } from "zod";

export const recurrenceSchema = z.object({
  clientId: z.string().min(1, "Client requis"),
  siteId: z.string().min(1, "Site requis"),
  natureIntervention: z.string().min(1, "Nature requise"),
  frequence: z.enum(["hebdomadaire", "mensuelle", "personnalisee"]),
  jourSemaine: z.coerce.number().min(0).max(6).optional(),
  jourMois: z.coerce.number().min(1).max(31).optional(),
  intervalleJours: z.coerce.number().min(1).optional(),
  heurePrevue: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide (HH:mm)").optional().default("08:00"),
  dureeEstimeeMinutes: z.coerce.number().min(30).optional().default(120),
  equipeId: z.string().optional(),
  vehiculeId: z.string().optional(),
  equipementIds: z.array(z.string()).optional().default([]),
  informationsParticulieres: z.string().optional().default(""),
  active: z.boolean().optional().default(true),
});

export type RecurrenceInput = z.infer<typeof recurrenceSchema>;
