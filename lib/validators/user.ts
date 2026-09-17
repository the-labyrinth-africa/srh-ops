import { z } from "zod";
import { USER_ROLES } from "@/types";

export const userCreateSchema = z.object({
  username: z
    .string()
    .min(3, "Le nom d'utilisateur doit contenir au moins 3 caractères")
    .regex(/^[a-zA-Z0-9_.-]+$/, "Caractères autorisés: lettres, chiffres, _, ., -"),
  nom: z.string().min(2, "Le nom est requis"),
  email: z.string().email("Adresse email invalide"),
  role: z.enum(USER_ROLES as [string, ...string[]]),
  telephone: z.string().optional().default(""),
  clientId: z.string().optional(),
  equipeId: z.string().optional(),
});

export const userUpdateSchema = z.object({
  nom: z.string().min(2, "Le nom est requis"),
  email: z.string().email("Adresse email invalide"),
  role: z.enum(USER_ROLES as [string, ...string[]]),
  telephone: z.string().optional().default(""),
  clientId: z.string().optional(),
  equipeId: z.string().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Mot de passe actuel requis"),
  newPassword: z.string().min(6, "Le nouveau mot de passe doit contenir au moins 6 caractères"),
});

export const forgotPasswordSchema = z.object({
  identifier: z.string().min(1, "Identifiant (username ou e-mail) requis"),
});
