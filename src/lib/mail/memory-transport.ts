import type { MailMessage, MailTransport } from "@/lib/mail/types";

/** Transport des tests : conserve les messages en mémoire, n'envoie rien. */
export class MemoryTransport implements MailTransport {
  sent: MailMessage[] = [];
  private failures = 0;

  async send(message: MailMessage): Promise<void> {
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error("Échec d'envoi simulé");
    }
    this.sent.push(message);
  }

  /** Fait échouer le prochain envoi (un seul). */
  failNext(): void {
    this.failures += 1;
  }

  reset(): void {
    this.sent = [];
    this.failures = 0;
  }
}
