import { beforeEach, describe, expect, it } from "vitest";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Site } from "@/backend/clients-sites/infrastructure/mongoose/site.model";
import { User } from "@/backend/comptes/infrastructure/mongoose/utilisateur.model";
import { Operation } from "@/backend/operations/infrastructure/mongoose/operation.model";
import { NotificationJobModel, type INotificationJob } from "./notification-job.model";
import { NotificationRepositoryMongoose } from "./notification.repository.mongoose";

const MAINTENANT = new Date("2030-11-04T08:00:00.000Z");

describe("NotificationRepositoryMongoose", () => {
  const depot = new NotificationRepositoryMongoose();

  beforeEach(async () => {
    await NotificationJobModel.init();
  });

  it("déduplique l'enqueue, reprend un job en échec puis conserve son état final", async () => {
    const message = { to: "dispatch@example.com", subject: "Alerte", text: "Une alerte" };
    expect(await depot.enqueue("event:1", message, MAINTENANT)).toBe(true);
    expect(await depot.enqueue("event:1", message, MAINTENANT)).toBe(false);

    const premier = await depot.claim(MAINTENANT, new Date(MAINTENANT.getTime() - 10 * 60_000));
    expect(premier).toMatchObject({ to: message.to, attempts: 1 });
    await depot.markRetry(premier!.id, 1, "send_failed", new Date(MAINTENANT.getTime() + 60_000), new Date(MAINTENANT.getTime() + 90 * 86_400_000));
    expect(await depot.claim(MAINTENANT, new Date(MAINTENANT.getTime() - 10 * 60_000))).toBeNull();

    const retry = await depot.claim(new Date(MAINTENANT.getTime() + 60_000), MAINTENANT);
    expect(retry).toMatchObject({ id: premier!.id, attempts: 2 });
    await depot.markSent(retry!.id, MAINTENANT, new Date(MAINTENANT.getTime() + 90 * 86_400_000));

    const sauvegarde = await NotificationJobModel.findById(retry!.id).lean<INotificationJob>();
    expect(sauvegarde).toMatchObject({ status: "sent", attempts: 2, to: message.to });
    expect(sauvegarde?.expiresAt).toBeInstanceOf(Date);
  });

  it("retourne les adresses de dispatch et uniquement les comptes client du périmètre concerné", async () => {
    const clientA = await Client.create({ nom: "Client A" });
    const clientB = await Client.create({ nom: "Client B" });
    await User.create([
      { username: "admin", nom: "Admin", email: "admin@example.com", motDePasseHash: "x", role: "admin" },
      { username: "dispatch", nom: "Dispatch", email: "dispatch@example.com", motDePasseHash: "x", role: "dispatcher" },
      { username: "client-a", nom: "Client A", email: "a@example.com", motDePasseHash: "x", role: "client", clientId: clientA._id },
      { username: "client-b", nom: "Client B", email: "b@example.com", motDePasseHash: "x", role: "client", clientId: clientB._id },
    ]);
    const site = await Site.create({ clientId: clientA._id, nom: "Site A", adresse: "Abidjan" });
    const operation = await Operation.create({
      clientId: clientA._id,
      siteId: site._id,
      natureIntervention: "Collecte A",
      dateHeurePrevue: new Date("2030-11-04T13:00:00.000Z"),
      statut: "Affectée",
    });

    expect(await depot.emailsInternes()).toEqual(expect.arrayContaining(["admin@example.com", "dispatch@example.com"]));
    expect(await depot.operationInfo(String(operation._id))).toMatchObject({ clientEmails: ["a@example.com"] });
  });

  it("sépare les opérations à rappeler des opérations en retard et ignore les statuts finaux", async () => {
    const client = await Client.create({ nom: "Client" });
    const site = await Site.create({ clientId: client._id, nom: "Site", adresse: "Abidjan" });
    const creer = (natureIntervention: string, dateHeurePrevue: Date, statut: string) =>
      Operation.create({ clientId: client._id, siteId: site._id, natureIntervention, dateHeurePrevue, statut });
    await creer("À venir", new Date("2030-11-04T13:00:00.000Z"), "Planifiée");
    await creer("En retard", new Date("2030-11-03T13:00:00.000Z"), "En cours");
    await creer("Terminée", new Date("2030-11-03T12:00:00.000Z"), "Terminée");
    await creer("Demande", new Date("2030-11-03T11:00:00.000Z"), "Demande");

    const prochaines = await depot.operationsProchaines(MAINTENANT, new Date("2030-11-05T08:00:00.000Z"));
    const retards = await depot.operationsEnRetard(MAINTENANT);
    expect(prochaines.map(({ natureIntervention }) => natureIntervention)).toEqual(["À venir"]);
    expect(retards.map(({ natureIntervention }) => natureIntervention)).toEqual(["En retard"]);
    expect(prochaines[0].clientEmails).toEqual([]);
  });
});
