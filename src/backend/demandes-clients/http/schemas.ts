import { z } from "zod";
import { objectIdSchema } from "@/shared/validators/object-id";

const futureDate = z.coerce.date().refine((value) => value.getTime() > Date.now(), {
  message: "La date souhaitée doit être dans le futur.",
});

export const demandePubliqueSchema = z
  .object({
    nomClient: z.string().trim().min(2).max(120),
    nomContact: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    telephone: z.string().trim().max(40).optional().default(""),
    nomSite: z.string().trim().min(2).max(120),
    adresseSite: z.string().trim().min(4).max(250),
    natureIntervention: z.string().trim().min(2).max(150),
    dateSouhaitee: futureDate,
    informationsParticulieres: z.string().trim().max(2000).optional().default(""),
  })
  .strict();

export const qualificationDemandeSchema = z
  .object({
    clientId: objectIdSchema("Client requis", "Identifiant client invalide"),
    siteId: objectIdSchema("Site requis", "Identifiant site invalide"),
  })
  .strict();

export const refusDemandeSchema = z
  .object({
    motif: z.string().trim().max(500).optional().default(""),
  })
  .strict();
