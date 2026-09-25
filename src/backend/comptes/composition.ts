// Assemblage des adaptateurs pour les cas d'usage de comptes (complété aux tâches 2-4).
import { UtilisateurRepositoryMongoose } from "./infrastructure/mongoose/utilisateur.repository.mongoose";
import { JetonRepositoryMongoose } from "./infrastructure/mongoose/jeton.repository.mongoose";
import { HacheurMotDePasseBcrypt } from "./infrastructure/mongoose/hacheur-mot-de-passe.bcrypt";
import { GenerateurDeSecretsAleatoire } from "./infrastructure/generateur-de-secrets.aleatoire";
import { sendMail } from "@/backend/platform/email";
import { consumeRateLimit } from "@/backend/platform/limiteur-debit/rate-limit";
import { runAfterResponse } from "@/backend/platform/execution-differee/execution-differee";
import { SystemClock } from "@/backend/platform/horloge/horloge";
import { appBaseUrl } from "@/backend/platform/http/url-applicative";
import { buildInvitationMail, buildResetMail, buildPasswordChangedMail } from "./infrastructure/email/gabarits-email";
import { creerCasDUsageUtilisateurs } from "./application/cas-d-usage-utilisateurs";
import type { EnvoiEmail, LimiteurDebit, ExecutionDifferee, UrlApplicative, GabaritsEmail } from "./domain/ports";

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
