import { z } from "zod";
import { USER_ROLES, type UserRole } from "@/shared/acces/roles";
import { optionalObjectIdSchema } from "@/lib/validators/object-id";
import type { UtilisateurSaisie } from "../domain/utilisateur";

const emptyToUndefined = (v: string | undefined) => (v ? v : undefined);

const scopedFields = {
  clientId: optionalObjectIdSchema("Identifiant de client invalide").transform(emptyToUndefined),
  equipeId: optionalObjectIdSchema("Identifiant d'équipe invalide").transform(emptyToUndefined),
};

function checkRoleScope(
  data: { role: string; clientId?: string; equipeId?: string },
  ctx: z.RefinementCtx
) {
  if (data.role === "client" && !data.clientId) {
    ctx.addIssue({ code: "custom", path: ["clientId"], message: "Un compte client doit être rattaché à un client" });
  }
  if (data.role !== "client" && data.clientId) {
    ctx.addIssue({ code: "custom", path: ["clientId"], message: "Seul un compte client peut être rattaché à un client" });
  }
  if (data.role === "chauffeur" && !data.equipeId) {
    ctx.addIssue({ code: "custom", path: ["equipeId"], message: "Un chauffeur doit être rattaché à une équipe" });
  }
  if (data.role !== "chauffeur" && data.equipeId) {
    ctx.addIssue({ code: "custom", path: ["equipeId"], message: "Seul un chauffeur peut être rattaché à une équipe" });
  }
}

export const userCreateSchema = z
  .object({
    username: z
      .string()
      .min(3, "Le nom d'utilisateur doit contenir au moins 3 caractères")
      .regex(/^[a-zA-Z0-9_.-]+$/, "Caractères autorisés: lettres, chiffres, _, ., -"),
    nom: z.string().min(2, "Le nom est requis"),
    email: z.string().email("Adresse email invalide"),
    role: z.enum(USER_ROLES as [string, ...string[]]),
    telephone: z.string().optional().default(""),
    ...scopedFields,
  })
  .superRefine(checkRoleScope);

export const userUpdateSchema = z
  .object({
    nom: z.string().min(2, "Le nom est requis"),
    email: z.string().email("Adresse email invalide"),
    role: z.enum(USER_ROLES as [string, ...string[]]),
    telephone: z.string().optional().default(""),
    ...scopedFields,
  })
  .superRefine(checkRoleScope);

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export function versSaisieCreation(entree: UserCreateInput): UtilisateurSaisie {
  return {
    username: entree.username,
    nom: entree.nom,
    email: entree.email,
    role: entree.role as UserRole,
    telephone: entree.telephone,
    clientId: entree.clientId,
    equipeId: entree.equipeId,
  };
}

export function versSaisieModification(entree: UserUpdateInput): UtilisateurSaisie {
  return {
    // `username` n'est jamais modifiable après création : `userUpdateSchema` ne le lit pas, et
    // `UtilisateurRepositoryMongoose.modifier` l'ignore volontairement (cf. tâche 1). Valeur
    // factice, jamais lue ni persistée.
    username: "",
    nom: entree.nom,
    email: entree.email,
    role: entree.role as UserRole,
    telephone: entree.telephone,
    clientId: entree.clientId,
    equipeId: entree.equipeId,
  };
}
