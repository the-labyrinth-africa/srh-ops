import { z } from "zod";
import { OPERATION_STATUSES } from "@/shared/operations/statuts";
import { QUANTITE_UNITES } from "@/shared/operations/quantites";
import { objectIdSchema, optionalObjectIdSchema } from "@/lib/validators/object-id";
import type { OperationSaisie } from "../domain/operation";

export const operationSchema = z.object({
  clientId: objectIdSchema("Client requis", "Identifiant client invalide"),
  siteId: objectIdSchema("Site requis", "Identifiant site invalide"),
  natureIntervention: z.string().min(1, "Nature requise"),
  dateHeurePrevue: z.string().min(1, "Date/heure requise"),
  dureeEstimeeMinutes: z.coerce.number().min(30).optional().default(120),
  equipeId: optionalObjectIdSchema("Identifiant équipe invalide"),
  vehiculeId: optionalObjectIdSchema("Identifiant véhicule invalide"),
  equipementIds: z
    .array(objectIdSchema("Équipement requis", "Identifiant équipement invalide"))
    .optional()
    .default([]),
  informationsParticulieres: z.string().optional().default(""),
  statut: z.enum(OPERATION_STATUSES as [string, ...string[]]).optional(),
  // Le client SRH n'a pas de collecte à quantité nulle : 0 n'est pas une valeur
  // valide, l'absence de quantité se traduit par l'absence du champ.
  quantiteCollectee: z.coerce.number().positive("Quantité collectée invalide").optional(),
  uniteQuantite: z.enum(QUANTITE_UNITES as [string, ...string[]]).optional().default("Litres"),
  remarquesTerrain: z.string().optional().default(""),
  nomSignataireClient: z.string().optional().default(""),
  signatureClient: z.string().optional().default(""),
});

export const statusUpdateSchema = z.object({
  statut: z.enum(OPERATION_STATUSES as [string, ...string[]]),
  quantiteCollectee: z.coerce.number().positive("Quantité collectée invalide").optional(),
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

/**
 * Sortie Zod → saisie du domaine. La recopie par décomposition conserve l'absence des clés
 * facultatives non fournies (`equipeId`, `vehiculeId`, `statut`, `quantiteCollectee`) : à la
 * modification, une clé absente laisse la valeur stockée intacte. Aucune validation de la date :
 * une chaîne illisible donne une date invalide, rejetée par Mongoose (comportement historique).
 */
export function versSaisieOperation(entree: OperationInput): OperationSaisie {
  return { ...entree, dateHeurePrevue: new Date(entree.dateHeurePrevue) } as OperationSaisie;
}
