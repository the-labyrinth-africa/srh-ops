import { after } from "next/server";

// Code d'erreur Next.js (16.3.5, next/dist/server/after/after.js) levé par `after()` hors contexte de requête.
const OUTSIDE_REQUEST_SCOPE = "E468";

/**
 * Exécute `task` après l'envoi de la réponse (temps de réponse indépendant du
 * travail fait : pas d'oracle temporel sur l'existence d'un compte). Hors
 * contexte de requête (tests), la tâche est exécutée immédiatement.
 *
 * Toute autre erreur synchrone de `after()` (enregistrement impossible, `waitUntil`
 * absent…) est signalée : la tâche s'exécute alors en ligne, ce qui rétablit un écart
 * de temps de réponse que l'exploitation doit pouvoir voir dans les journaux.
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
  } catch (error) {
    const outsideRequestScope =
      (error as { __NEXT_ERROR_CODE?: string } | null)?.__NEXT_ERROR_CODE === OUTSIDE_REQUEST_SCOPE;
    if (!outsideRequestScope) {
      console.error(
        "[after] indisponible en contexte de requête, exécution en ligne :",
        error instanceof Error ? error.name : "erreur"
      );
    }
    await safe();
  }
}
