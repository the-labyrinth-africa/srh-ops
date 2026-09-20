import { z } from "zod";

export const equipeSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  membres: z.array(z.string()).optional().default([]),
  disponibilite: z.boolean().optional().default(true),
});

export type EquipeInput = z.infer<typeof equipeSchema>;
