import type { UserRole } from "@/shared/acces/roles";
import type { Utilisateur, UtilisateurSaisie } from "./utilisateur";
import type { sendMail } from "@/backend/platform/email";
import type { consumeRateLimit } from "@/backend/platform/limiteur-debit/rate-limit";
import type { runAfterResponse } from "@/backend/platform/execution-differee/execution-differee";
import type { Horloge } from "@/backend/platform/horloge/horloge";

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

// Types de fonction réutilisant directement les signatures des modules `platform` déjà livrés
// (import de type uniquement, aucune ré-implémentation).
export type EnvoiEmail = typeof sendMail;
export type LimiteurDebit = typeof consumeRateLimit;
export type ExecutionDifferee = typeof runAfterResponse;
export type { Horloge };

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
