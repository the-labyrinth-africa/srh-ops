import { z } from "zod";
import type { EquipementSaisie } from "../domain/equipement";

export const equipementSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  type: z.string().optional().default(""),
  disponibilite: z.boolean().optional().default(true),
});

export type EquipementInput = z.infer<typeof equipementSchema>;

export function versSaisie(entree: EquipementInput): EquipementSaisie {
  return {
    nom: entree.nom,
    type: entree.type,
    disponibilite: entree.disponibilite,
  };
}
