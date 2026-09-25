// Assemblage des adaptateurs pour les cas d'usage de comptes (complété aux tâches 2-4).
import { UtilisateurRepositoryMongoose } from "./infrastructure/mongoose/utilisateur.repository.mongoose";
import { JetonRepositoryMongoose } from "./infrastructure/mongoose/jeton.repository.mongoose";
import { HacheurMotDePasseBcrypt } from "./infrastructure/mongoose/hacheur-mot-de-passe.bcrypt";
import { GenerateurDeSecretsAleatoire } from "./infrastructure/generateur-de-secrets.aleatoire";
import { sendMail } from "@/backend/platform/email";
import { consumeRateLimit } from "@/backend/platform/limiteur-debit/rate-limit";
import { runAfterResponse } from "@/backend/platform/execution-differee/execution-differee";
import { SystemClock } from "@/backend/platform/horloge/horloge";

export const utilisateurs = new UtilisateurRepositoryMongoose();
export const jetons = new JetonRepositoryMongoose();
export const hacheur = new HacheurMotDePasseBcrypt();
export const generateurDeSecrets = new GenerateurDeSecretsAleatoire();
export const envoiEmail = sendMail;
export const limiteurDebit = consumeRateLimit;
export const executionDifferee = runAfterResponse;
export const horloge = new SystemClock();
