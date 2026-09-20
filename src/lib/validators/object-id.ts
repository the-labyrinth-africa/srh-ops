import { z } from "zod";
import { isValidObjectId } from "@/backend/platform/http/identifiants";

/**
 * Identifiant Mongo obligatoire. Sans cette validation, une chaîne quelconque
 * traverse Zod puis explose en CastError (500) au premier accès Mongoose.
 */
export function objectIdSchema(requiredMessage: string, invalidMessage: string) {
  return z
    .string()
    .min(1, requiredMessage)
    .refine((value) => isValidObjectId(value), invalidMessage);
}

/**
 * Identifiant Mongo facultatif. La chaîne vide reste acceptée : elle signifie
 * « non renseigné » dans les formulaires existants.
 */
export function optionalObjectIdSchema(invalidMessage: string) {
  return z
    .string()
    .refine((value) => value === "" || isValidObjectId(value), invalidMessage)
    .optional();
}
