import { z } from "zod";
import { QUANTITE_UNITES } from "@/shared/operations/quantites";

export const identiteEntrepriseSchema = z.object({
  nomEntreprise: z.string().trim().min(2, "Le nom de l'entreprise est requis.").max(120),
  sigle: z.string().trim().min(1, "Le sigle est requis.").max(16),
  siteWeb: z
    .string()
    .trim()
    .max(2048)
    .refine(
      (value) => value === "" || (z.string().url().safeParse(value).success && value.startsWith("https://")),
      "Saisissez une adresse de site web commençant par https://."
    ),
  uniteQuantiteGlobale: z.union([z.enum(QUANTITE_UNITES), z.literal("")]).optional(),
});
