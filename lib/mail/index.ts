import { MailConfigError, readSmtpConfig } from "@/lib/mail/config";
import { MemoryTransport } from "@/lib/mail/memory-transport";
import { SmtpTransport } from "@/lib/mail/smtp-transport";
import type { MailMessage, MailResult, MailTransport } from "@/lib/mail/types";

type Env = Record<string, string | undefined>;

let memory: MemoryTransport | undefined;

export function getMemoryTransport(): MemoryTransport {
  memory ??= new MemoryTransport();
  return memory;
}

/**
 * null → aucun transport configuré. Lève MailConfigError si SMTP est mal configuré, ou si le
 * transport mémoire (réservé aux tests) est demandé en production : il avalerait les e-mails.
 */
export function resolveTransport(env: Env = process.env): MailTransport | null {
  if (env.NODE_ENV === "production" && env.MAIL_TRANSPORT === "memory") {
    throw new MailConfigError(["MAIL_TRANSPORT"]);
  }
  if (env.MAIL_TRANSPORT === "memory" || env.NODE_ENV === "test") return getMemoryTransport();
  const config = readSmtpConfig(env);
  return config ? SmtpTransport.fromConfig(config) : null;
}

/**
 * Envoie un e-mail sans jamais lever ni journaliser son contenu (corps, lien,
 * destinataire) : seuls l'objet et la nature de l'échec sont tracés.
 */
export async function sendMail(message: MailMessage, env: Env = process.env): Promise<MailResult> {
  let transport: MailTransport | null;
  try {
    transport = resolveTransport(env);
  } catch (error) {
    console.error(
      "[mail] configuration invalide :",
      error instanceof MailConfigError ? error.message : "erreur inconnue"
    );
    return { ok: false, reason: "not_configured" };
  }

  if (!transport) {
    console.warn(`[mail] aucun transport configuré : « ${message.subject} » non envoyé`);
    return { ok: false, reason: "not_configured" };
  }

  try {
    await transport.send(message);
    return { ok: true };
  } catch (error) {
    console.error(
      `[mail] échec d'envoi de « ${message.subject} » :`,
      error instanceof Error ? error.name : "erreur inconnue"
    );
    return { ok: false, reason: "send_failed" };
  }
}
