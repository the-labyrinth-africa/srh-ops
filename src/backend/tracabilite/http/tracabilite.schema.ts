import { z } from "zod";
import { QUANTITE_UNITES } from "@/shared/operations/quantites";

export const traceabiliteSchema = z
  .object({
    identifiantSuivi: z
      .string()
      .trim()
      .min(2, "Identifiant de suivi requis")
      .max(80, "L'identifiant de suivi ne peut dépasser 80 caractères")
      .regex(/^[\p{L}\d][\p{L}\d._/-]*$/u, "Utilisez des lettres, chiffres, points, tirets ou barres obliques"),
    typeDechet: z.string().trim().min(1, "Type de déchet requis").max(120),
    volume: z.coerce.number().positive("Le volume doit être supérieur à zéro").max(1_000_000_000),
    unite: z.enum(QUANTITE_UNITES),
    traitement: z.string().trim().min(1, "Traitement requis").max(500),
  })
  .strict();

export type TraceabiliteInput = z.infer<typeof traceabiliteSchema>;
