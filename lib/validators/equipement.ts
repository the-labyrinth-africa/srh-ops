import { z } from "zod";

export const equipementSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  type: z.string().optional().default(""),
  disponibilite: z.boolean().optional().default(true),
});

export type EquipementInput = z.infer<typeof equipementSchema>;
