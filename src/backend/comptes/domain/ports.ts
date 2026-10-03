import type { UserRole } from "@/shared/acces/roles";
import type { Utilisateur, UtilisateurSaisie } from "./utilisateur";

export type JetonFinalite = "reset" | "invitation";

export interface UtilisateurRepository {
  lister(role?: UserRole): Promise<Utilisateur[]>;
  trouverParId(id: string): Promise<Utilisateur | null>;
  /** Recherche insensible à la casse par email (si `identifiant` contient un `@`) ou par username. */
  trouverProjectionParIdentifiant(identifiant: string): Promise<{ id: string; nom: string; email: string } | null>;
  existeEmailOuUsername(email: string, username: string): Promise<{ email: boolean; username: boolean }>;
  creer(saisie: UtilisateurSaisie, motDePasseHash: string): Promise<Utilisateur>;
  /** null si l'utilisateur n'existe pas. */
  modifier(id: string, saisie: UtilisateurSaisie): Promise<Utilisateur | null>;
  /** false si l'utilisateur n'existait pas. */
  supprimer(id: string): Promise<boolean>;
  changerMotDePasse(
    id: string,
    motDePasseHash: string,
    options: { mustChangePassword: boolean; poserPasswordChangedAt: boolean }
  ): Promise<{ id: string; nom: string; email: string } | null>;
  /** Seule méthode du dépôt à renvoyer le hash ; jamais exposée par les autres méthodes de lecture. */
  trouverHashMotDePasse(id: string): Promise<string | null>;
}

export interface JetonRepository {
  emettre(userId: string, finalite: JetonFinalite, maintenant: Date): Promise<{ token: string; expiresAt: Date }>;
  /** null si le jeton est inconnu, mal formé, expiré ou déjà utilisé. */
  consommer(token: string, maintenant: Date): Promise<{ userId: string; finalite: JetonFinalite } | null>;
  /** Supprime les jetons non consommés (`usedAt: null`) de l'utilisateur visé, toutes finalités confondues. */
  revoquerEnAttente(userId: string): Promise<void>;
}

export interface HacheurMotDePasse {
  hacher(motDePasse: string): Promise<string>;
  comparer(motDePasse: string, hash: string): Promise<boolean>;
}

export interface GenerateurDeSecrets {
  motDePasseAleatoire(longueur?: number): string;
}

// Déclarations locales, indépendantes de `platform` (règle R1 : la couche `domain` n'importe que
// `src/shared` et son propre `domain/`). Ces formes reprennent fidèlement celles des modules
// `platform` déjà livrés, sans les réimporter : les fonctions réelles assemblées dans
// `composition.ts` (`sendMail`, `consumeRateLimit`, `runAfterResponse`, `SystemClock`) restent
// structurellement compatibles avec ces types plus étroits (ex. `sendMail` accepte un second
// paramètre `env` optionnel que ces types ne mentionnent pas — compatible côté appelant).
export type ResultatEnvoiEmail = { ok: true } | { ok: false; reason: "not_configured" | "send_failed" };
export type EnvoiEmail = (message: MessageEmail) => Promise<ResultatEnvoiEmail>;

export interface ResultatLimiteDeDebit {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}
export type LimiteurDebit = (
  scope: string,
  id: string,
  opts: { limit: number; windowMs: number },
  now?: number
) => Promise<ResultatLimiteDeDebit>;

export type ExecutionDifferee = (tache: () => Promise<void>) => Promise<void>;

export interface Horloge {
  maintenant(): Date;
}

/** Calcule l'URL de base de l'application ; lève si mal configurée. Port autour de `appBaseUrl`. */
export type UrlApplicative = () => string;

export interface MessageEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Gabarits d'e-mails du domaine `comptes`, injectés pour ne jamais importer `infrastructure/` depuis `application/`. */
export interface GabaritsEmail {
  invitation(destinataire: { nom: string; email: string }, lien: string): MessageEmail;
  reinitialisation(destinataire: { nom: string; email: string }, lien: string): MessageEmail;
  motDePasseModifie(destinataire: { nom: string; email: string }): MessageEmail;
}

/** Adresse IP de l'appelant, pour le limiteur de débit. Port autour de `clientIp`. */
export type AdresseClient = (req: Request) => string;

/** Existence des entités auxquelles un compte peut être rattaché (elles vivent dans d'autres domaines). */
export interface RattachementsDeCompte {
  clientExiste(clientId: string): Promise<boolean>;
  equipeExiste(equipeId: string): Promise<boolean>;
}
