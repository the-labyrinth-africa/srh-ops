import { after } from "next/server";

/**
 * Exécute `task` après l'envoi de la réponse (temps de réponse indépendant du
 * travail fait : pas d'oracle temporel sur l'existence d'un compte). Hors
 * contexte de requête (tests), la tâche est exécutée immédiatement.
 */
export async function runAfterResponse(task: () => Promise<void>): Promise<void> {
  const safe = async () => {
    try {
      await task();
    } catch (error) {
      console.error("[after] tâche différée en échec :", error instanceof Error ? error.name : "erreur");
    }
  };

  try {
    after(safe);
  } catch {
    await safe();
  }
}
