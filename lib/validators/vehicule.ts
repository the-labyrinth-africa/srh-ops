import { z } from "zod";

export const vehiculeSchema = z.object({
  identification: z.string().min(1, "Immatriculation requise"),
  type: z.string().optional().default(""),
  capacite: z.coerce.number().min(0).optional().default(0),
  disponibilite: z.boolean().optional().default(true),
});

export type VehiculeInput = z.infer<typeof vehiculeSchema>;
