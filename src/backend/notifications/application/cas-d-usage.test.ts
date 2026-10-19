import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailNotification, NotificationJob, OperationNotification } from "../domain/notification";
import type { NotificationMail, NotificationRepository } from "../domain/ports";
import { creerCasDUsageNotifications } from "./cas-d-usage";

const NOW = new Date("2030-11-04T08:00:00.000Z");

class FakeNotifications implements NotificationRepository {
  jobs = new Map<string, EmailNotification & { id: string; attempts: number; due: Date }>();
  queue: string[] = [];
  clients = ["client@example.com"];
  internes = ["dispatch@example.com"];
  operation: OperationNotification = {
    id: "op-1",
    clientId: "client-1",
    natureIntervention: "Collecte",
    dateHeurePrevue: new Date("2030-11-04T10:00:00.000Z"),
    statut: "Affectée",
    clientEmails: this.clients,
  };
  prochaines: OperationNotification[] = [];
  retards: OperationNotification[] = [];

  async enqueue(key: string, message: EmailNotification, now: Date) {
    if (this.jobs.has(key)) return false;
    this.jobs.set(key, { ...message, id: key, attempts: 0, due: now });
    this.queue.push(key);
    return true;
  }

  async claim(now: Date): Promise<NotificationJob | null> {
    const key = this.queue.find((candidate) => {
      const job = this.jobs.get(candidate);
      return job && job.due <= now;
    });
    if (!key) return null;
    this.queue = this.queue.filter((candidate) => candidate !== key);
    const job = this.jobs.get(key)!;
    job.attempts++;
    return { id: job.id, to: job.to, subject: job.subject, text: job.text, attempts: job.attempts };
  }

  async markSent(id: string) {
    this.jobs.delete(id);
  }

  async markRetry(id: string, attempts: number, _reason: string, retryAt: Date) {
    const job = this.jobs.get(id);
    if (job) {
      job.attempts = attempts;
      job.due = retryAt;
      this.queue.push(id);
    }
  }

  async emailsInternes() { return this.internes; }
  async operationInfo() { return this.operation; }
  async operationsProchaines() { return this.prochaines; }
  async operationsEnRetard() { return this.retards; }
}

describe("notifications automatiques", () => {
  let repository: FakeNotifications;
  let envoyer: ReturnType<typeof vi.fn<NotificationMail["send"]>>;
  let casDUsage: ReturnType<typeof creerCasDUsageNotifications>;

  beforeEach(() => {
    repository = new FakeNotifications();
    envoyer = vi.fn<NotificationMail["send"]>().mockResolvedValue({ ok: true });
    casDUsage = creerCasDUsageNotifications({
      repository,
      mail: { send: envoyer },
      maintenant: () => new Date(NOW),
    });
  });

  it("alerte les dispatchers à réception d'une demande, sans écrire plusieurs jobs identiques", async () => {
    const demande = {
      id: "request-1",
      nomClient: "Client SRH",
      nomContact: "Awa",
      email: "awa@example.com",
      nomSite: "Site A",
      natureIntervention: "Collecte",
      dateSouhaitee: new Date("2030-11-06T08:00:00.000Z"),
    };
    await casDUsage.notifierNouvelleDemande(demande);
    await casDUsage.notifierNouvelleDemande(demande);

    expect(repository.jobs.size).toBe(1);
    expect([...repository.jobs.values()][0].to).toBe("dispatch@example.com");
    expect([...repository.jobs.values()][0].text).toContain("request-1");
  });

  it("envoie une mise à jour de statut aux comptes client rattachés", async () => {
    await casDUsage.notifierChangementStatut("op-1", "Planifiée", "Affectée", NOW);
    const resultat = await casDUsage.traiterFile();

    expect(resultat).toEqual({ envoyes: 1, aReessayer: 0, echecDefinitif: 0 });
    expect(envoyer).toHaveBeenCalledWith(expect.objectContaining({
      to: "client@example.com",
      subject: "Mise à jour de votre collecte SRH",
    }));
  });

  it("programme un rappel client et une alerte dispatcher de retard de façon idempotente par jour", async () => {
    const upcoming = { ...repository.operation, dateHeurePrevue: new Date("2030-11-04T12:00:00.000Z") };
    const overdue = { ...repository.operation, id: "op-late", dateHeurePrevue: new Date("2030-11-03T12:00:00.000Z") };
    repository.prochaines = [upcoming];
    repository.retards = [overdue];

    expect(await casDUsage.programmerAlertesQuotidiennes()).toBe(2);
    expect(await casDUsage.programmerAlertesQuotidiennes()).toBe(0);
    expect(repository.jobs.size).toBe(2);
    expect([...repository.jobs.values()].map((job) => job.to).sort()).toEqual([
      "client@example.com",
      "dispatch@example.com",
    ]);
  });

  it("réessaie une panne d'envoi avec un délai au lieu de perdre le job", async () => {
    await repository.enqueue("retry", { to: "dispatch@example.com", subject: "Test", text: "Test" }, NOW);
    envoyer.mockResolvedValueOnce({ ok: false, reason: "send_failed" });

    expect(await casDUsage.traiterFile()).toEqual({ envoyes: 0, aReessayer: 1, echecDefinitif: 0 });
    expect(repository.jobs.get("retry")?.due.getTime()).toBe(NOW.getTime() + 60_000);
    expect(await casDUsage.traiterFile()).toEqual({ envoyes: 0, aReessayer: 0, echecDefinitif: 0 });
  });
});
