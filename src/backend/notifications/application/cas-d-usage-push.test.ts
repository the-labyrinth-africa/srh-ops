import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AbonnementPushRepository, LivraisonPush } from "../domain/ports";
import type { AbonnementPush } from "../domain/push";
import { creerCasDUsagePush } from "./cas-d-usage-push";

const abonnement: AbonnementPush = {
  id: "subscription-1",
  userId: "user-1",
  role: "admin",
  endpoint: "https://push.example.test/1",
  keys: { p256dh: "public-key", auth: "auth-key" },
};

describe("cas d'usage push", () => {
  let abonnements: AbonnementPushRepository;
  let livraison: LivraisonPush;
  let casDUsage: ReturnType<typeof creerCasDUsagePush>;

  beforeEach(() => {
    abonnements = {
      enregistrer: vi.fn(),
      retirer: vi.fn(),
      lister: vi.fn().mockResolvedValue([abonnement]),
      supprimer: vi.fn(),
    };
    livraison = {
      clePublique: vi.fn().mockReturnValue("public-vapid-key"),
      estConfiguree: vi.fn().mockReturnValue(true),
      envoyer: vi.fn().mockResolvedValue(undefined),
    };
    casDUsage = creerCasDUsagePush({ abonnements, livraison });
  });

  it("expose la clé publique et délègue les changements d'abonnement", async () => {
    const subscription = { endpoint: abonnement.endpoint, keys: abonnement.keys };
    expect(casDUsage.clePublique()).toBe("public-vapid-key");
    await casDUsage.enregistrer("user-1", "admin", subscription);
    await casDUsage.retirer("user-1", abonnement.endpoint);
    expect(abonnements.enregistrer).toHaveBeenCalledWith("user-1", "admin", subscription);
    expect(abonnements.retirer).toHaveBeenCalledWith("user-1", abonnement.endpoint);
  });

  it("ne lit ni n'envoie d'abonnements lorsque VAPID n'est pas configuré", async () => {
    vi.mocked(livraison.estConfiguree).mockReturnValue(false);

    await casDUsage.envoyerAuxAbonnes({ title: "Titre", body: "Message" });

    expect(abonnements.lister).not.toHaveBeenCalled();
    expect(livraison.envoyer).not.toHaveBeenCalled();
  });

  it("cible les rôles demandés et transmet le message aux abonnés", async () => {
    const message = { title: "Titre", body: "Message", url: "/terrain", roles: ["admin"] };

    await casDUsage.envoyerAuxAbonnes(message);

    expect(abonnements.lister).toHaveBeenCalledWith(["admin"]);
    expect(livraison.envoyer).toHaveBeenCalledWith(abonnement, message);
  });

  it.each([404, 410])("supprime un abonnement expiré (HTTP %i)", async (statusCode) => {
    vi.mocked(livraison.envoyer).mockRejectedValueOnce(Object.assign(new Error("expired"), { statusCode }));

    await casDUsage.envoyerAuxAbonnes({ title: "Titre", body: "Message" });

    expect(abonnements.supprimer).toHaveBeenCalledWith(abonnement.id);
  });

  it("journalise une erreur de livraison temporaire sans interrompre le traitement", async () => {
    const erreur = Object.assign(new Error("network"), { statusCode: 503 });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(livraison.envoyer).mockRejectedValueOnce(erreur);

    await expect(casDUsage.envoyerAuxAbonnes({ title: "Titre", body: "Message" })).resolves.toBeUndefined();

    expect(abonnements.supprimer).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("[web-push] Livraison impossible.", 503);
  });
});
