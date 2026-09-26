import { LimiteDeDebitAtteinte, LienInvalideOuExpire } from "../domain/erreurs";
import type {
  UtilisateurRepository,
  JetonRepository,
  HacheurMotDePasse,
  EnvoiEmail,
  ExecutionDifferee,
  LimiteurDebit,
  Horloge,
  GabaritsEmail,
} from "../domain/ports";

const HEURE_MS = 3_600_000;

/** `purpose` d'un jeton admissible pour choisir un mot de passe : réinitialisation ou activation d'invitation. */
const FINALITES_ADMISSIBLES = new Set(["reset", "invitation"]);

export interface DependancesReinitialisation {
  utilisateurs: UtilisateurRepository;
  jetons: JetonRepository;
  hacheur: HacheurMotDePasse;
  envoiEmail: EnvoiEmail;
  executionDifferee: ExecutionDifferee;
  limiteurDebit: LimiteurDebit;
  horloge: Horloge;
  /** Gabarits d'e-mails, injectés pour ne jamais importer `infrastructure/` depuis `application/`. */
  gabarits: GabaritsEmail;
}

export function creerCasDUsageReinitialisation({
  utilisateurs,
  jetons,
  hacheur,
  envoiEmail,
  executionDifferee,
  limiteurDebit,
  horloge,
  gabarits,
}: DependancesReinitialisation) {
  return {
    /**
     * Séparé de `reinitialiser` pour que le contrôleur puisse l'appeler AVANT de lire/valider le
     * corps de la requête — ordre exact de la route d'origine (limiteur d'abord, corps ensuite),
     * contrairement à « mot de passe oublié » qui valide le corps avant de limiter. Échec
     * **fermé** : une erreur du limiteur (service indisponible) se propage telle quelle (non
     * capturée), contrairement au cas d'usage « mot de passe oublié » qui l'avale — contraste
     * volontaire. Une limite atteinte lève `LimiteDeDebitAtteinte`.
     */
    async verifierLimiteDeDebit(adresseIp: string): Promise<void> {
      const limite = await limiteurDebit("reset-ip", adresseIp, { limit: 20, windowMs: HEURE_MS });
      if (!limite.allowed) throw new LimiteDeDebitAtteinte(limite.retryAfterSeconds);
    },

    /**
     * `token`/`nouveauMotDePasse` sont déjà validés (forme) par le contrôleur avant cet appel :
     * le mot de passe est donc toujours validé AVANT toute consommation de jeton, qui n'a lieu
     * qu'ici. Un jeton invalide, expiré, déjà utilisé ou de finalité non admissible lève
     * `LienInvalideOuExpire`.
     */
    async reinitialiser(token: string, nouveauMotDePasse: string): Promise<void> {
      const consomme = await jetons.consommer(token, horloge.maintenant());
      if (!consomme || !FINALITES_ADMISSIBLES.has(consomme.finalite)) {
        throw new LienInvalideOuExpire();
      }

      const hash = await hacheur.hacher(nouveauMotDePasse);
      const resultat = await utilisateurs.changerMotDePasse(consomme.userId, hash, {
        mustChangePassword: false,
        poserPasswordChangedAt: true,
      });
      if (!resultat) throw new LienInvalideOuExpire();

      // Choisir un mot de passe révoque tous les autres liens en attente (un compte peut avoir à
      // la fois une invitation et une réinitialisation) : une invitation mal acheminée ne doit
      // pas rester utilisable ensuite. Le jeton consommé reste en base (traçabilité).
      await jetons.revoquerEnAttente(consomme.userId);

      // L'e-mail « mot de passe modifié » n'a de sens que pour un compte existant : pas après
      // l'activation d'une invitation, où le titulaire choisit son tout premier mot de passe.
      if (consomme.finalite === "reset") {
        const destinataire = { nom: resultat.nom, email: resultat.email };
        await executionDifferee(async () => {
          await envoiEmail(gabarits.motDePasseModifie(destinataire));
        });
      }
    },
  };
}

export type CasDUsageReinitialisation = ReturnType<typeof creerCasDUsageReinitialisation>;
