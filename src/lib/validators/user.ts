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
