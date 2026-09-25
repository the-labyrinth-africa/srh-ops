import { z } from "zod";
import type { VehiculeSaisie } from "../domain/vehicule";

export const vehiculeSchema = z.object({
  identification: z.string().min(1, "Immatriculation requise"),
  type: z.string().optional().default(""),
  capacite: z.coerce.number().min(0).optional().default(0),
  disponibilite: z.boolean().optional().default(true),
});

export type VehiculeInput = z.infer<typeof vehiculeSchema>;

export function versSaisie(entree: VehiculeInput): VehiculeSaisie {
  return {
    identification: entree.identification,
    type: entree.type,
    capacite: entree.capacite,
    disponibilite: entree.disponibilite,
  };
}
