const DEFAULT_MESSAGE = "Erreur de traitement";

const firstString = (list: unknown): string | undefined =>
  Array.isArray(list) ? list.find((m): m is string => typeof m === "string" && m !== "") : undefined;

/**
 * Transforme le champ `error` d'une réponse d'API en texte affichable.
 * Les routes renvoient soit une chaîne, soit l'objet `flatten()` de Zod
 * ({ formErrors, fieldErrors }) : ce dernier ne doit jamais atteindre le rendu React.
 */
export function formatApiError(error: unknown, fallback: string = DEFAULT_MESSAGE): string {
  if (typeof error === "string") return error || fallback;
  if (error && typeof error === "object") {
    const { message, fieldErrors, formErrors } = error as {
      message?: unknown;
      fieldErrors?: unknown;
      formErrors?: unknown;
    };
    if (typeof message === "string" && message) return message;
    if (fieldErrors && typeof fieldErrors === "object") {
      for (const messages of Object.values(fieldErrors)) {
        const found = firstString(messages);
        if (found) return found;
      }
    }
    const form = firstString(formErrors);
    if (form) return form;
  }
  return fallback;
}
