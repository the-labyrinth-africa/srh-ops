import { z } from "zod";

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Mot de passe actuel requis"),
  newPassword: z.string().min(6, "Le nouveau mot de passe doit contenir au moins 6 caractères"),
});

export const forgotPasswordSchema = z.object({
  identifier: z
    .string()
    .min(1, "Identifiant (username ou e-mail) requis")
    .max(254, "Identifiant trop long"),
});

export const INVALID_LINK = "Lien invalide ou expiré. Demandez un nouveau lien.";
const PASSWORD_REQUIRED = "Le nouveau mot de passe est requis";

// Bornes de saisie : le jeton fait 43 caractères ; bcrypt ne lit de toute façon que 72 octets.
// Transposé tel quel depuis `resetSchema`, défini localement dans `reset-password/route.ts`
// jusqu'à cette tâche (jamais partagé auparavant).
export const resetPasswordSchema = z.object({
  token: z.string({ required_error: INVALID_LINK, invalid_type_error: INVALID_LINK }).max(512, INVALID_LINK),
  newPassword: z
    .string({ required_error: PASSWORD_REQUIRED, invalid_type_error: PASSWORD_REQUIRED })
    .min(6, "Le nouveau mot de passe doit contenir au moins 6 caractères")
    .max(128, "Le mot de passe ne doit pas dépasser 128 caractères"),
});
