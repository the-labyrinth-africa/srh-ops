import { z } from "zod";
import type { ClientSaisie } from "../domain/client";

export const clientSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  contact: z.object({
    telephone: z.string().optional().default(""),
    email: z.string().email("Email invalide").optional().or(z.literal("")),
  }),
});

export type ClientInput = z.infer<typeof clientSchema>;

export function versSaisieClient(entree: ClientInput): ClientSaisie {
  return { nom: entree.nom, contact: entree.contact };
}
