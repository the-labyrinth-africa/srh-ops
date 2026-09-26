import { LimiteDeDebitAtteinte } from "../domain/erreurs";
import type {
  UtilisateurRepository,
  JetonRepository,
  EnvoiEmail,
  LimiteurDebit,
  ExecutionDifferee,
  Horloge,
  UrlApplicative,
  GabaritsEmail,
} from "../domain/ports";

const HEURE_MS = 3_600_000;

export interface DependancesMotDePasseOublie {
  utilisateurs: UtilisateurRepository;
  jetons: JetonRepository;
  envoiEmail: EnvoiEmail;
  limiteurDebit: LimiteurDebit;
  executionDifferee: ExecutionDifferee;
  horloge: Horloge;
  /** Port autour de `appBaseUrl` : jamais importé directement depuis `application/` (règle R2). */
  urlApplicative: UrlApplicative;
  /** Gabarits d'e-mails, injectés pour ne jamais importer `infrastructure/` depuis `application/`. */
  gabarits: GabaritsEmail;
}

export function creerCasDUsageMotDePasseOublie({
  utilisateurs,
  jetons,
  envoiEmail,
  limiteurDebit,
  executionDifferee,
  horloge,
  urlApplicative,
  gabarits,
}: DependancesMotDePasseOublie) {
  /**
   * Recherche + émission de jeton + envoi : encapsulées dans une fonction unique passée à
   * `executionDifferee`, jamais exécutées avant la réponse (aucun oracle temporel sur
   * l'existence d'un compte). Ne capture volontairement aucune erreur : `executionDifferee`
   * (`runAfterResponse`) journalise déjà tout échec de la tâche différée lui-même.
   */
  async function rechercherEtEnvoyer(identifiant: string): Promise<void> {
    const utilisateur = await utilisateurs.trouverProjectionParIdentifiant(identifiant);
    if (!utilisateur) return;

    // Base d'URL calculée AVANT d'émettre le jeton : sans URL valide, le jeton précédent reste intact.
    const base = urlApplicative();
    const { token } = await jetons.emettre(utilisateur.id, "reset", horloge.maintenant());
    const lien = `${base}/reset-password?token=${token}`;
    await envoiEmail(gabarits.reinitialisation({ nom: utilisateur.nom, email: utilisateur.email }, lien));
  }

  return {
    /**
     * Ne renvoie jamais d'indication sur l'existence du compte : le contrôleur, pas ce cas
     * d'usage, décide du corps de réponse générique. Deux issues distinctes sur le double
     * limiteur (IP + identifiant) : un limiteur en échec (service indisponible) est avalé
     * silencieusement ici même (réponse générique quand même, comme le fait la route actuelle) ;
     * une limite atteinte lève `LimiteDeDebitAtteinte`, seule façon pour le contrôleur de
     * distinguer les deux cas.
     */
    async demander(identifiant: string, adresseIp: string): Promise<void> {
      const identifiantNormalise = identifiant.trim().toLowerCase();

      let parIp: Awaited<ReturnType<LimiteurDebit>>;
      let parIdentifiant: Awaited<ReturnType<LimiteurDebit>>;
      try {
        [parIp, parIdentifiant] = await Promise.all([
          limiteurDebit("forgot-ip", adresseIp, { limit: 10, windowMs: HEURE_MS }),
          limiteurDebit("forgot-id", identifiantNormalise, { limit: 5, windowMs: HEURE_MS }),
        ]);
      } catch (error) {
        // Limiteur ou base indisponible : même réponse générique (aucun oracle sur les comptes,
        // jamais de 500), sans envoi. Seul le nom de l'erreur est journalisé.
        console.error("[forgot-password] limiteur indisponible :", error instanceof Error ? error.name : "erreur");
        return;
      }

      if (!parIp.allowed || !parIdentifiant.allowed) {
        const retryApresSecondes = Math.max(parIp.retryAfterSeconds, parIdentifiant.retryAfterSeconds);
        throw new LimiteDeDebitAtteinte(retryApresSecondes);
      }

      await executionDifferee(() => rechercherEtEnvoyer(identifiantNormalise));
    },
  };
}

export type CasDUsageMotDePasseOublie = ReturnType<typeof creerCasDUsageMotDePasseOublie>;
