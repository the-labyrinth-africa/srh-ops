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
  // `contact.email` est optionnel côté schéma Zod (pas de `.default("")` comme pour `telephone`) ;
  // le domaine exige une chaîne, d'où la coercition ici, à la frontière HTTP.
  return { nom: entree.nom, contact: { telephone: entree.contact.telephone, email: entree.contact.email ?? "" } };
}
