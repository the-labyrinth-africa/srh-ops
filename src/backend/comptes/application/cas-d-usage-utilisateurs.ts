import type { UserRole } from "@/shared/acces/roles";
import type { Utilisateur, UtilisateurSaisie } from "../domain/utilisateur";
import {
  UtilisateurIntrouvable,
  EmailDejaUtilise,
  UsernameDejaUtilise,
  SuppressionDeSoiInterdite,
} from "../domain/erreurs";
import type {
  UtilisateurRepository,
  JetonRepository,
  HacheurMotDePasse,
  GenerateurDeSecrets,
  EnvoiEmail,
  LimiteurDebit,
  Horloge,
  UrlApplicative,
  GabaritsEmail,
} from "../domain/ports";

export interface DependancesUtilisateurs {
  utilisateurs: UtilisateurRepository;
  jetons: JetonRepository;
  hacheur: HacheurMotDePasse;
  generateurDeSecrets: GenerateurDeSecrets;
  envoiEmail: EnvoiEmail;
  limiteurDebit: LimiteurDebit;
  horloge: Horloge;
  /** Port autour de `appBaseUrl` : jamais importé directement depuis `application/` (règle R2). */
  urlApplicative: UrlApplicative;
  /** Gabarits d'e-mails, injectés pour ne jamais importer `infrastructure/` depuis `application/`. */
  gabarits: GabaritsEmail;
}

export interface ResultatCreationUtilisateur {
  utilisateur: Utilisateur;
  /** Vrai si l'invitation a effectivement été envoyée par e-mail. */
  invitationEnvoyee: boolean;
  /** Mot de passe temporaire en clair ; le contrôleur ne doit l'exposer que si `invitationEnvoyee` est faux. */
  motDePasseGenere: string;
}

export type ResultatEnvoiLien =
  | { statut: "limite_atteinte"; retryApresSecondes: number }
  | { statut: "envoye" }
  | { statut: "non_envoye"; motif?: string };

export function creerCasDUsageUtilisateurs({
  utilisateurs,
  jetons,
  hacheur,
  generateurDeSecrets,
  envoiEmail,
  limiteurDebit,
  horloge,
  urlApplicative,
  gabarits,
}: DependancesUtilisateurs) {
  return {
    lister(role?: UserRole): Promise<Utilisateur[]> {
      return utilisateurs.lister(role);
    },

    async obtenir(id: string): Promise<Utilisateur> {
      const utilisateur = await utilisateurs.trouverParId(id);
      if (!utilisateur) throw new UtilisateurIntrouvable();
      return utilisateur;
    },

    async creer(saisie: UtilisateurSaisie): Promise<ResultatCreationUtilisateur> {
      // Doublon email/username vérifié AVANT toute écriture (même priorité que la route d'origine :
      // l'e-mail est signalé en premier si les deux sont pris).
      const existe = await utilisateurs.existeEmailOuUsername(saisie.email, saisie.username);
      if (existe.email) throw new EmailDejaUtilise();
      if (existe.username) throw new UsernameDejaUtilise();

      const motDePasseGenere = generateurDeSecrets.motDePasseAleatoire(10);
      const motDePasseHash = await hacheur.hacher(motDePasseGenere);
      // `UtilisateurRepositoryMongoose.creer` force déjà `mustChangePassword: true`.
      const utilisateur = await utilisateurs.creer(saisie, motDePasseHash);

      // Invitation : lien d'activation valable 72 h (durée encodée dans `JetonRepositoryMongoose`).
      // Le mot de passe temporaire ne sert qu'en repli si l'e-mail ne part pas.
      let invitationEnvoyee = false;
      try {
        // Base d'URL calculée AVANT d'émettre le jeton : sans URL valide, aucun jeton n'est créé.
        const base = urlApplicative();
        const { token } = await jetons.emettre(utilisateur.id, "invitation", horloge.maintenant());
        const lien = `${base}/reset-password?token=${token}`;
        const resultat = await envoiEmail(gabarits.invitation({ nom: utilisateur.nom, email: utilisateur.email }, lien));
        invitationEnvoyee = resultat.ok;
      } catch (error) {
        console.error("[invitation] impossible de préparer l'e-mail :", error instanceof Error ? error.name : "erreur");
      }

      return { utilisateur, invitationEnvoyee, motDePasseGenere };
    },

    async modifier(id: string, saisie: UtilisateurSaisie): Promise<Utilisateur> {
      // Adresse actuelle, pour savoir s'il faut révoquer les liens envoyés à l'ancienne adresse.
      const avant = await utilisateurs.trouverParId(id);
      const apres = await utilisateurs.modifier(id, saisie);
      if (!apres) throw new UtilisateurIntrouvable();

      if (avant && avant.email.toLowerCase() !== apres.email.toLowerCase()) {
        await jetons.revoquerEnAttente(id);
      }

      return apres;
    },

    async supprimer(id: string, appelantId: string): Promise<void> {
      // Refus AVANT toute tentative de suppression.
      if (id === appelantId) throw new SuppressionDeSoiInterdite();
      if (!(await utilisateurs.supprimer(id))) throw new UtilisateurIntrouvable();
    },

    async regenererMotDePasse(id: string): Promise<{ motDePasseGenere: string }> {
      const motDePasseGenere = generateurDeSecrets.motDePasseAleatoire(10);
      const motDePasseHash = await hacheur.hacher(motDePasseGenere);
      const resultat = await utilisateurs.changerMotDePasse(id, motDePasseHash, {
        mustChangePassword: true,
        poserPasswordChangedAt: true,
      });
      if (!resultat) throw new UtilisateurIntrouvable();

      // Régénérer le mot de passe révoque aussi les liens en attente (invitation comprise) : un lien
      // mal acheminé (adresse erronée) ne doit pas rester utilisable après la régénération.
      await jetons.revoquerEnAttente(id);
      return { motDePasseGenere };
    },

    async envoyerLienDeReinitialisation(id: string): Promise<ResultatEnvoiLien> {
      // Limiteur consulté AVANT toute autre action. Une erreur ici (limiteur indisponible) doit se
      // propager telle quelle jusqu'au contrôleur (503) : volontairement non capturée dans ce bloc.
      const limite = await limiteurDebit("send-link", id, { limit: 5, windowMs: 3_600_000 });
      if (!limite.allowed) return { statut: "limite_atteinte", retryApresSecondes: limite.retryAfterSeconds };

      const utilisateur = await utilisateurs.trouverParId(id);
      if (!utilisateur) throw new UtilisateurIntrouvable();

      try {
        // Base d'URL calculée AVANT d'émettre le jeton : sans URL valide, le jeton précédent reste intact.
        const base = urlApplicative();
        const { token } = await jetons.emettre(id, "reset", horloge.maintenant());
        const lien = `${base}/reset-password?token=${token}`;
        const resultat = await envoiEmail(gabarits.reinitialisation({ nom: utilisateur.nom, email: utilisateur.email }, lien));
        return resultat.ok ? { statut: "envoye" } : { statut: "non_envoye", motif: resultat.reason };
      } catch (error) {
        console.error("[send-reset-link] impossible de préparer l'e-mail :", error instanceof Error ? error.name : "erreur");
        return { statut: "non_envoye", motif: "not_configured" };
      }
    },
  };
}

export type CasDUsageUtilisateurs = ReturnType<typeof creerCasDUsageUtilisateurs>;
