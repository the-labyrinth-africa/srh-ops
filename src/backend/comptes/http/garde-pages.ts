import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../composition";
import { canAccessPath, homePathFor } from "@/shared/acces/acces-pages";

/**
 * À appeler en tête de chaque page serveur du tableau de bord, avant toute
 * lecture de données. `redirect` interrompt le rendu : le code qui suit ne
 * s'exécute jamais pour un rôle refusé.
 */
export async function requirePageAccess(pathname: string): Promise<Session> {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  if (session.user.mustChangePassword && pathname !== "/profil") {
    redirect("/profil?forcer=1");
  }

  const role = session.user.role;
  if (!canAccessPath(role, pathname)) {
    // Un rôle hors énumération (ou absent) n'a pas de page d'accueil valide :
    // renvoyer vers "/" bouclerait indéfiniment, on le renvoie se reconnecter.
    const home = homePathFor(role);
    redirect(canAccessPath(role, home) ? home : "/login");
  }

  return session;
}
