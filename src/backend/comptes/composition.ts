// Assemblage des adaptateurs pour les cas d'usage de comptes (complété aux tâches 2-4).
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import { User as UtilisateurModel } from "./infrastructure/mongoose/utilisateur.model";
import { UtilisateurRepositoryMongoose } from "./infrastructure/mongoose/utilisateur.repository.mongoose";
import { JetonRepositoryMongoose } from "./infrastructure/mongoose/jeton.repository.mongoose";
import { HacheurMotDePasseBcrypt } from "./infrastructure/mongoose/hacheur-mot-de-passe.bcrypt";
import { GenerateurDeSecretsAleatoire } from "./infrastructure/generateur-de-secrets.aleatoire";
import { authOptions } from "./infrastructure/next-auth/options";
import { sendMail } from "@/backend/platform/email";
import { consumeRateLimit } from "@/backend/platform/limiteur-debit/rate-limit";
import { runAfterResponse } from "@/backend/platform/execution-differee/execution-differee";
import { SystemClock } from "@/backend/platform/horloge/horloge";
import { appBaseUrl } from "@/backend/platform/http/url-applicative";
import { clientIp } from "@/backend/platform/http/adresse-client";
import { buildInvitationMail, buildResetMail, buildPasswordChangedMail } from "./infrastructure/email/gabarits-email";
import { creerCasDUsageUtilisateurs } from "./application/cas-d-usage-utilisateurs";
import { creerCasDUsageMotDePasseOublie } from "./application/cas-d-usage-mot-de-passe-oublie";
import { creerCasDUsageReinitialisation } from "./application/cas-d-usage-reinitialisation";
import { creerCasDUsageChangementMotDePasse } from "./application/cas-d-usage-changement-mot-de-passe";
import { creerCasDUsageEmailDeTest } from "./application/cas-d-usage-email-de-test";
import { creerVerificationRattachements } from "./application/verifier-rattachements";
import type {
  EnvoiEmail,
  LimiteurDebit,
  ExecutionDifferee,
  UrlApplicative,
  GabaritsEmail,
  AdresseClient,
} from "./domain/ports";

export const utilisateurs = new UtilisateurRepositoryMongoose();
export const jetons = new JetonRepositoryMongoose();
export const hacheur = new HacheurMotDePasseBcrypt();
export const generateurDeSecrets = new GenerateurDeSecretsAleatoire();
// Délégation par fonction (et non par alias direct `export const x = y`) : un alias direct fige la
// référence de fonction au chargement du module, ce qui rend `vi.spyOn` inopérant sur les tests qui
// espionnent `consumeRateLimit`/`sendMail`/`runAfterResponse` après coup (constaté sur
// `tests/integration/send-reset-link.test.ts`, cas « limiteur en panne » — la valeur figée
// contournait silencieusement le mock et renvoyait 200 au lieu de 503). Une fonction wrapper relit
// l'import à chaque appel et reste donc sensible au mock, sans changer le comportement réel.
export const envoiEmail: EnvoiEmail = (...args) => sendMail(...args);
export const limiteurDebit: LimiteurDebit = (...args) => consumeRateLimit(...args);
export const executionDifferee: ExecutionDifferee = (...args) => runAfterResponse(...args);
export const horloge = new SystemClock();
export const urlApplicative: UrlApplicative = appBaseUrl;
// Alias direct (pas un wrapper) : rien n'espionne `clientIp` aujourd'hui, donc la classe de bug
// documentée sur `envoiEmail`/`limiteurDebit`/`executionDifferee` ne s'applique pas ici (même
// raisonnement que `urlApplicative`, confirmé indépendamment à la revue de la tâche 2).
export const adresseClient: AdresseClient = clientIp;
export const gabaritsEmail: GabaritsEmail = {
  invitation: buildInvitationMail,
  reinitialisation: buildResetMail,
  motDePasseModifie: buildPasswordChangedMail,
};

export const casDUsageUtilisateurs = creerCasDUsageUtilisateurs({
  utilisateurs,
  jetons,
  hacheur,
  generateurDeSecrets,
  envoiEmail,
  limiteurDebit,
  horloge,
  urlApplicative,
  gabarits: gabaritsEmail,
});

export const casDUsageMotDePasseOublie = creerCasDUsageMotDePasseOublie({
  utilisateurs,
  jetons,
  envoiEmail,
  limiteurDebit,
  executionDifferee,
  horloge,
  urlApplicative,
  gabarits: gabaritsEmail,
});

export const casDUsageReinitialisation = creerCasDUsageReinitialisation({
  utilisateurs,
  jetons,
  hacheur,
  envoiEmail,
  executionDifferee,
  limiteurDebit,
  horloge,
  gabarits: gabaritsEmail,
});

export const casDUsageChangementMotDePasse = creerCasDUsageChangementMotDePasse({
  utilisateurs,
  jetons,
  hacheur,
});

export const casDUsageEmailDeTest = creerCasDUsageEmailDeTest({
  utilisateurs,
  envoiEmail,
  limiteurDebit,
});

/**
 * Message d'erreur si le client ou l'équipe de rattachement d'un compte n'existent pas, sinon `null`.
 * Les clients et les équipes vivent dans leurs propres domaines : on interroge leur API publique,
 * jamais leurs modèles. Import dynamique, au moment de l'appel : `clients-sites` et `equipes`
 * dépendent eux-mêmes de `comptes` (garde de suppression) ; un import statique fermerait une
 * boucle de chargement dont l'issue dépend du premier module chargé (constaté : « … is not a
 * constructor » selon le point d'entrée).
 */
export const erreurDeRattachement = creerVerificationRattachements({
  rattachements: {
    clientExiste: async (clientId) => (await import("@/backend/clients-sites/index")).existeClient(clientId),
    equipeExiste: async (equipeId) => (await import("@/backend/equipes/index")).existeEquipe(equipeId),
  },
});

// API publique du domaine `comptes` pour les autres domaines (ré-exportée par `index.ts`, seul
// point d'entrée autorisé pour les autres domaines — règle R5).
//
// Exception documentée (même nature que `enregistrement-modeles.ts`) : `RattachementsUtilisateursMongoose`
// de `clients-sites` et `equipes` vérifie qu'aucun utilisateur n'est rattaché à un client/une équipe
// avant suppression. Cette vérification interrogeait directement `User` quand le modèle vivait encore
// dans `src/models/` (dossier hérité, toléré en infrastructure) ; son commentaire d'origine anticipait
// déjà « l'import passera par `@/backend/comptes/index` » une fois le modèle rattaché à ce domaine.
// Seules ces deux capacités ciblées traversent la frontière — jamais le modèle Mongoose lui-même :
// exposer l'ODM donnerait à un autre domaine un pouvoir de requête arbitraire sur les données de
// `comptes`, ce que cette API publique doit précisément empêcher. Vit ici (et non dans `index.ts`)
// parce que `composition.ts` est le seul point du domaine autorisé à importer l'infrastructure
// (`connectDB`, le modèle Mongoose) — règle INDEX.

// Ré-export de `authOptions` : `http/acteur.ts` (couche `http`) ne peut pas importer
// `infrastructure/` directement (règle R3, « http n'importe pas infrastructure sauf composition.ts ») ;
// il passe donc par ce point, comme tout autre accès de `http/` à l'infrastructure du domaine.
export { authOptions };

/** Vrai si au moins un compte utilisateur référence ce `clientId`. */
export async function existeUtilisateurAvecClientId(clientId: string): Promise<boolean> {
  await connectDB();
  return Boolean(await UtilisateurModel.exists({ clientId }));
}

/** Vrai si au moins un compte utilisateur référence cet `equipeId`. */
export async function existeUtilisateurAvecEquipeId(equipeId: string): Promise<boolean> {
  await connectDB();
  return Boolean(await UtilisateurModel.exists({ equipeId }));
}
