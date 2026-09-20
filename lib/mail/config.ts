export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

/** Ne contient que des NOMS de variables : jamais leurs valeurs. */
export class MailConfigError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Configuration SMTP incomplète ou invalide : ${missing.join(", ")}`);
    this.name = "MailConfigError";
  }
}

type Env = Record<string, string | undefined>;

/**
 * null  → SMTP non configuré (SMTP_HOST absent ou vide) ;
 * lève MailConfigError si l'hôte est renseigné mais que le reste est incomplet.
 */
export function readSmtpConfig(env: Env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  if (!host) return null;

  const missing: string[] = [];
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASSWORD;
  if (!user) missing.push("SMTP_USER");
  if (!pass) missing.push("SMTP_PASSWORD");

  const rawPort = env.SMTP_PORT?.trim();
  const port = rawPort ? Number(rawPort) : 465;
  if (!Number.isInteger(port) || port < 1 || port > 65535) missing.push("SMTP_PORT");

  if (missing.length > 0) throw new MailConfigError(missing);

  const secure =
    env.SMTP_SECURE === "true" ? true : env.SMTP_SECURE === "false" ? false : port === 465;

  return {
    host,
    port,
    secure,
    user: user as string,
    pass: pass as string,
    from: env.MAIL_FROM?.trim() || `SRH <${user}>`,
  };
}
