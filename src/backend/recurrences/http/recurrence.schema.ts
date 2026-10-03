import { z } from "zod";
import { objectIdSchema, optionalObjectIdSchema } from "@/lib/validators/object-id";
import type { RecurrenceSaisie } from "../domain/recurrence";

export const recurrenceSchema = z.object({
  clientId: objectIdSchema("Client requis", "Identifiant client invalide"),
  siteId: objectIdSchema("Site requis", "Identifiant site invalide"),
  natureIntervention: z.string().min(1, "Nature requise"),
  frequence: z.enum(["hebdomadaire", "mensuelle", "personnalisee"]),
  jourSemaine: z.coerce.number().min(0).max(6).optional(),
  jourMois: z.coerce.number().min(1).max(31).optional(),
  intervalleJours: z.coerce.number().min(1).optional(),
  heurePrevue: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide (HH:mm)").optional().default("08:00"),
  dureeEstimeeMinutes: z.coerce.number().min(30).optional().default(120),
  equipeId: optionalObjectIdSchema("Identifiant équipe invalide"),
  vehiculeId: optionalObjectIdSchema("Identifiant véhicule invalide"),
  equipementIds: z
    .array(objectIdSchema("Équipement requis", "Identifiant équipement invalide"))
    .optional()
    .default([]),
  informationsParticulieres: z.string().optional().default(""),
  active: z.boolean().optional().default(true),
});

export type RecurrenceInput = z.infer<typeof recurrenceSchema>;

/**
 * Sortie Zod → saisie du domaine, sans recopie champ par champ : une clé facultative absente doit
 * rester absente (à la modification, elle laisse la valeur stockée intacte).
 */
export function versSaisieRecurrence(entree: RecurrenceInput): RecurrenceSaisie {
  return entree as RecurrenceSaisie;
}
