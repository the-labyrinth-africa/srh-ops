import { z } from "zod";
import { objectIdSchema } from "@/shared/validators/object-id";

const futureDate = z.coerce.date().refine((value) => value.getTime() > Date.now(), {
  message: "La date souhaitée doit être dans le futur.",
});

export const demandeOperationClientSchema = z
  .object({
    siteId: objectIdSchema("Site requis", "Identifiant de site invalide"),
    natureIntervention: z.string().trim().min(2).max(150),
    dateSouhaitee: futureDate,
    informationsParticulieres: z.string().trim().max(2000).optional().default(""),
  })
  .strict();
