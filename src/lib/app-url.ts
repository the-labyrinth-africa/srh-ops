export class AppUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppUrlError";
  }
}

/** URL publique de l'application (liens des e-mails). */
export function appBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = env.NEXTAUTH_URL?.trim();
  if (!raw) throw new AppUrlError("NEXTAUTH_URL n'est pas défini");
  const url = raw.replace(/\/+$/, "");
  if (env.NODE_ENV === "production" && !url.startsWith("https://")) {
    throw new AppUrlError("NEXTAUTH_URL doit être en https en production");
  }
  return url;
}
