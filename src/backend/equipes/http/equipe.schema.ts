import { z } from "zod";
import type { EquipeSaisie } from "../domain/equipe";

export const equipeSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  membres: z.array(z.string()).optional().default([]),
  disponibilite: z.boolean().optional().default(true),
});

export type EquipeInput = z.infer<typeof equipeSchema>;

export function versSaisie(entree: EquipeInput): EquipeSaisie {
  return { nom: entree.nom, membres: entree.membres, disponibilite: entree.disponibilite };
}
