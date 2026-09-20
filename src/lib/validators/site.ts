import { z } from "zod";

export const siteSchema = z.object({
  clientId: z.string().min(1, "Client requis"),
  nom: z.string().min(1, "Le nom est requis"),
  adresse: z.string().optional().default(""),
  localisation: z
    .object({ lat: z.number(), lng: z.number() })
    .optional(),
  typeDechets: z.array(z.string()).optional().default([]),
  observations: z.string().optional().default(""),
});

export type SiteInput = z.infer<typeof siteSchema>;
