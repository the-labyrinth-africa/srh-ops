/**
 * ATTENTION : le limiteur par IP repose sur l'en-tête posé par la plateforme
 * (`x-vercel-forwarded-for`, ou `x-real-ip`). Derrière un autre proxy, il faut le configurer pour
 * qu'il transmette l'adresse du client ; sinon tous les clients tombent dans le même seau
 * "unknown" et partagent la même limite (verrouillage global).
 *
 * Adresse du client, par ordre de priorité : `x-vercel-forwarded-for`, `x-real-ip`,
 * premier saut de `x-forwarded-for` (en-têtes posés par la plateforme), sinon "unknown".
 */
export function clientIp(req: Request): string {
  const vercel = req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercel) return vercel;
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const first = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || "unknown";
}
