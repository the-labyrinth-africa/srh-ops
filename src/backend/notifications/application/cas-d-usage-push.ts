import type { AbonnementPushRepository, LivraisonPush } from "../domain/ports";
import type { MessagePush } from "../domain/push";

export function creerCasDUsagePush({ abonnements, livraison }: {
  abonnements: AbonnementPushRepository;
  livraison: LivraisonPush;
}) {
  return {
    clePublique: () => livraison.clePublique(),

    enregistrer(userId: string, role: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
      return abonnements.enregistrer(userId, role, subscription);
    },

    retirer(userId: string, endpoint: string) {
      return abonnements.retirer(userId, endpoint);
    },

    async envoyerAuxAbonnes(message: MessagePush): Promise<void> {
      if (!livraison.estConfiguree()) return;
      const cibles = await abonnements.lister(message.roles ?? ["admin", "dispatcher"]);
      await Promise.all(cibles.map(async (abonnement) => {
        try {
          await livraison.envoyer(abonnement, message);
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await abonnements.supprimer(abonnement.id);
          } else {
            console.error("[web-push] Livraison impossible.", statusCode ?? "erreur réseau");
          }
        }
      }));
    },
  };
}

export type CasDUsagePush = ReturnType<typeof creerCasDUsagePush>;
