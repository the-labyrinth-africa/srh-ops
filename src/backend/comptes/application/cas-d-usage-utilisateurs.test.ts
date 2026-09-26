import { describe, it, expect } from "vitest";
import { creerCasDUsageUtilisateurs, type DependancesUtilisateurs } from "./cas-d-usage-utilisateurs";
import {
  UtilisateurIntrouvable,
  EmailDejaUtilise,
  UsernameDejaUtilise,
  SuppressionDeSoiInterdite,
} from "../domain/erreurs";
import type { Utilisateur, UtilisateurSaisie } from "../domain/utilisateur";
import type {
  UtilisateurRepository,
  JetonRepository,
  JetonFinalite,
  HacheurMotDePasse,
  GenerateurDeSecrets,
  EnvoiEmail,
  LimiteurDebit,
  Horloge,
  UrlApplicative,
  GabaritsEmail,
} from "../domain/ports";
import type { MailMessage } from "@/backend/platform/email/types";

// ---------------------------------------------------------------------------
// Faux en mémoire, un par port — locaux à ce fichier de test (pas de dossier
// `infrastructure/en-memoire` prévu par le plan pour cette tâche).
// ---------------------------------------------------------------------------

type UtilisateurInterne = Utilisateur & { motDePasseHash: string };

class UtilisateurRepositoryEnMemoire implements UtilisateurRepository {
  private items = new Map<string, UtilisateurInterne>();
  private sequence = 0;

  private sansHash(u: UtilisateurInterne): Utilisateur {
    const reste: Partial<UtilisateurInterne> = { ...u };
    delete reste.motDePasseHash;
    return reste as Utilisateur;
  }

  async lister(role?: UserRoleFiltre): Promise<Utilisateur[]> {
    const tous = [...this.items.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const filtres = role ? tous.filter((u) => u.role === role) : tous;
    return filtres.map((u) => this.sansHash(u));
  }

  async trouverParId(id: string): Promise<Utilisateur | null> {
    const u = this.items.get(id);
    return u ? this.sansHash(u) : null;
  }

  async trouverProjectionParIdentifiant(identifiant: string) {
    const normalise = identifiant.trim().toLowerCase();
    const trouve = [...this.items.values()].find((u) =>
      normalise.includes("@") ? u.email === normalise : u.username === normalise
    );
    return trouve ? { id: trouve.id, nom: trouve.nom, email: trouve.email } : null;
  }

  async existeEmailOuUsername(email: string, username: string) {
    const emailNormalise = email.toLowerCase();
    const usernameNormalise = username.toLowerCase();
    const trouve = [...this.items.values()].find(
      (u) => u.email === emailNormalise || u.username === usernameNormalise
    );
    if (!trouve) return { email: false, username: false };
    return { email: trouve.email === emailNormalise, username: trouve.username === usernameNormalise };
  }

  async creer(saisie: UtilisateurSaisie, motDePasseHash: string): Promise<Utilisateur> {
    this.sequence += 1;
    const id = `u${this.sequence}`;
    const maintenant = new Date(this.sequence * 1000);
    const utilisateur: UtilisateurInterne = {
      id,
      username: saisie.username.toLowerCase(),
      nom: saisie.nom,
      email: saisie.email.toLowerCase(),
      role: saisie.role,
      telephone: saisie.telephone,
      mustChangePassword: true,
      createdAt: maintenant,
      updatedAt: maintenant,
      motDePasseHash,
      ...(saisie.clientId !== undefined ? { clientId: { id: saisie.clientId, nom: "Client" } } : {}),
      ...(saisie.equipeId !== undefined ? { equipeId: { id: saisie.equipeId, nom: "Équipe" } } : {}),
    };
    this.items.set(id, utilisateur);
    return this.sansHash(utilisateur);
  }

  async modifier(id: string, saisie: UtilisateurSaisie): Promise<Utilisateur | null> {
    const existant = this.items.get(id);
    if (!existant) return null;
    const maj: UtilisateurInterne = {
      ...existant,
      nom: saisie.nom,
      email: saisie.email.toLowerCase(),
      role: saisie.role,
      telephone: saisie.telephone,
      updatedAt: new Date(),
    };
    delete maj.clientId;
    delete maj.equipeId;
    if (saisie.clientId) maj.clientId = { id: saisie.clientId, nom: "Client" };
    if (saisie.equipeId) maj.equipeId = { id: saisie.equipeId, nom: "Équipe" };
    this.items.set(id, maj);
    return this.sansHash(maj);
  }

  async supprimer(id: string): Promise<boolean> {
    return this.items.delete(id);
  }

  async changerMotDePasse(
    id: string,
    motDePasseHash: string,
    options: { mustChangePassword: boolean; poserPasswordChangedAt: boolean }
  ) {
    const existant = this.items.get(id);
    if (!existant) return null;
    existant.motDePasseHash = motDePasseHash;
    existant.mustChangePassword = options.mustChangePassword;
    if (options.poserPasswordChangedAt) existant.passwordChangedAt = new Date();
    return { id: existant.id, nom: existant.nom, email: existant.email };
  }

  async trouverHashMotDePasse(id: string): Promise<string | null> {
    return this.items.get(id)?.motDePasseHash ?? null;
  }
}

type UserRoleFiltre = UtilisateurSaisie["role"];

class JetonRepositoryEnMemoire implements JetonRepository {
  emissions: { userId: string; finalite: JetonFinalite }[] = [];
  revocations: string[] = [];

  async emettre(userId: string, finalite: JetonFinalite, maintenant: Date) {
    this.emissions.push({ userId, finalite });
    return { token: `jeton-${this.emissions.length}`, expiresAt: new Date(maintenant.getTime() + 1000) };
  }

  async consommer(): Promise<null> {
    return null;
  }

  async revoquerEnAttente(userId: string): Promise<void> {
    this.revocations.push(userId);
  }
}

class HacheurMotDePasseFake implements HacheurMotDePasse {
  async hacher(motDePasse: string): Promise<string> {
    return `hache:${motDePasse}`;
  }
  async comparer(motDePasse: string, hash: string): Promise<boolean> {
    return hash === `hache:${motDePasse}`;
  }
}

class GenerateurDeSecretsFake implements GenerateurDeSecrets {
  private compteur = 0;
  motDePasseAleatoire(longueur = 10): string {
    this.compteur += 1;
    return `mdp${this.compteur}`.padEnd(longueur, "x");
  }
}

const URL_VALIDE = "https://ops.example.test";

/** Fake gabarits distinguables par `subject`, pour vérifier que chaque cas d'usage appelle le bon. */
const gabaritsFake: GabaritsEmail = {
  invitation: (destinataire, lien) => ({ to: destinataire.email, subject: "invitation", text: lien }),
  reinitialisation: (destinataire, lien) => ({ to: destinataire.email, subject: "reinitialisation", text: lien }),
  motDePasseModifie: (destinataire) => ({ to: destinataire.email, subject: "mot-de-passe-modifie", text: "" }),
};

/** Mime `appBaseUrl()` non configurée : lève avant tout jeton. */
const urlApplicativeIndisponible: UrlApplicative = () => {
  throw new Error("NEXTAUTH_URL n'est pas défini");
};

function creerDependances(
  overrides: Partial<Pick<DependancesUtilisateurs, "envoiEmail" | "limiteurDebit" | "horloge" | "urlApplicative">> = {}
) {
  const utilisateurs = new UtilisateurRepositoryEnMemoire();
  const jetons = new JetonRepositoryEnMemoire();
  const hacheur = new HacheurMotDePasseFake();
  const generateurDeSecrets = new GenerateurDeSecretsFake();
  const envoisEnvoyes: MailMessage[] = [];
  const envoiEmail: EnvoiEmail =
    overrides.envoiEmail ??
    (async (message: MailMessage) => {
      envoisEnvoyes.push(message);
      return { ok: true };
    });
  const limiteurDebit: LimiteurDebit =
    overrides.limiteurDebit ?? (async () => ({ allowed: true, remaining: 4, retryAfterSeconds: 60 }));
  const horloge: Horloge = overrides.horloge ?? { maintenant: () => new Date("2026-01-01T00:00:00.000Z") };
  const urlApplicative: UrlApplicative = overrides.urlApplicative ?? (() => URL_VALIDE);

  const deps: DependancesUtilisateurs = {
    utilisateurs,
    jetons,
    hacheur,
    generateurDeSecrets,
    envoiEmail,
    limiteurDebit,
    horloge,
    urlApplicative,
    gabarits: gabaritsFake,
  };
  return { deps, utilisateurs, jetons, hacheur, generateurDeSecrets, envoisEnvoyes };
}

function saisie(o: {
  username: string;
  email: string;
  role: UtilisateurSaisie["role"];
  clientId?: string;
  equipeId?: string;
}): UtilisateurSaisie {
  return {
    username: o.username,
    nom: `Nom ${o.username}`,
    email: o.email,
    role: o.role,
    telephone: "",
    clientId: o.clientId,
    equipeId: o.equipeId,
  };
}

describe("cas d'usage des utilisateurs", () => {
  describe("lister", () => {
    it("triés par date de création décroissante, filtrés par rôle si fourni", async () => {
      const { deps } = creerDependances();
      const cas = creerCasDUsageUtilisateurs(deps);
      await cas.creer(saisie({ username: "a", email: "a@srh.ci", role: "dispatcher" }));
      await cas.creer(saisie({ username: "b", email: "b@srh.ci", role: "admin" }));
      await cas.creer(saisie({ username: "c", email: "c@srh.ci", role: "dispatcher" }));

      expect((await cas.lister()).map((u) => u.username)).toEqual(["c", "b", "a"]);
      expect((await cas.lister("dispatcher")).map((u) => u.username)).toEqual(["c", "a"]);
    });
  });

  describe("obtenir", () => {
    it("renvoie l'utilisateur existant, lève UtilisateurIntrouvable sinon", async () => {
      const { deps } = creerDependances();
      const cas = creerCasDUsageUtilisateurs(deps);
      const { utilisateur } = await cas.creer(saisie({ username: "t", email: "t@srh.ci", role: "dispatcher" }));
      expect((await cas.obtenir(utilisateur.id)).username).toBe("t");
      await expect(cas.obtenir("inconnu")).rejects.toBeInstanceOf(UtilisateurIntrouvable);
    });
  });

  describe("creer", () => {
    it("génère un mot de passe, le hache, force mustChangePassword à true", async () => {
      const { deps, hacheur, utilisateurs } = creerDependances();
      const cas = creerCasDUsageUtilisateurs(deps);
      const resultat = await cas.creer(saisie({ username: "d", email: "d@srh.ci", role: "dispatcher" }));

      expect(resultat.utilisateur.mustChangePassword).toBe(true);
      expect(typeof resultat.motDePasseGenere).toBe("string");
      expect(await utilisateurs.trouverHashMotDePasse(resultat.utilisateur.id)).toBe(
        await hacheur.hacher(resultat.motDePasseGenere)
      );
    });

    it("émet un jeton d'invitation et envoie l'e-mail (gabarit invitation) quand l'URL applicative est disponible", async () => {
      const { deps, jetons, envoisEnvoyes } = creerDependances();
      const cas = creerCasDUsageUtilisateurs(deps);
      const resultat = await cas.creer(saisie({ username: "e", email: "e@srh.ci", role: "dispatcher" }));

      expect(resultat.invitationEnvoyee).toBe(true);
      expect(jetons.emissions).toEqual([{ userId: resultat.utilisateur.id, finalite: "invitation" }]);
      expect(envoisEnvoyes).toHaveLength(1);
      expect(envoisEnvoyes[0].to).toBe("e@srh.ci");
      expect(envoisEnvoyes[0].subject).toBe("invitation");
    });

    it("urlApplicative indisponible : aucun jeton n'est émis, repli sur le mot de passe généré", async () => {
      const { deps, jetons } = creerDependances({ urlApplicative: urlApplicativeIndisponible });
      const cas = creerCasDUsageUtilisateurs(deps);
      const resultat = await cas.creer(saisie({ username: "f", email: "f@srh.ci", role: "dispatcher" }));

      expect(resultat.invitationEnvoyee).toBe(false);
      expect(jetons.emissions).toEqual([]);
      expect(typeof resultat.motDePasseGenere).toBe("string");
    });

    it("échec de l'envoi d'e-mail : repli sur le mot de passe généré, sans lever", async () => {
      const envoiEmail: EnvoiEmail = async () => ({ ok: false, reason: "send_failed" });
      const { deps } = creerDependances({ envoiEmail });
      const cas = creerCasDUsageUtilisateurs(deps);
      const resultat = await cas.creer(saisie({ username: "g", email: "g@srh.ci", role: "dispatcher" }));

      expect(resultat.invitationEnvoyee).toBe(false);
      expect(typeof resultat.motDePasseGenere).toBe("string");
    });

    it("refuse un e-mail déjà utilisé, avant toute écriture", async () => {
      const { deps, utilisateurs } = creerDependances();
      const cas = creerCasDUsageUtilisateurs(deps);
      await cas.creer(saisie({ username: "h1", email: "dup@srh.ci", role: "dispatcher" }));

      await expect(cas.creer(saisie({ username: "h2", email: "dup@srh.ci", role: "dispatcher" }))).rejects.toBeInstanceOf(
        EmailDejaUtilise
      );
      expect((await utilisateurs.lister()).map((u) => u.username)).toEqual(["h1"]);
    });

    it("refuse un nom d'utilisateur déjà utilisé, avant toute écriture", async () => {
      const { deps, utilisateurs } = creerDependances();
      const cas = creerCasDUsageUtilisateurs(deps);
      await cas.creer(saisie({ username: "dupuser", email: "i1@srh.ci", role: "dispatcher" }));

      await expect(
        cas.creer(saisie({ username: "dupuser", email: "i2@srh.ci", role: "dispatcher" }))
      ).rejects.toBeInstanceOf(UsernameDejaUtilise);
      expect((await utilisateurs.lister()).map((u) => u.email)).toEqual(["i1@srh.ci"]);
    });
  });

  describe("modifier", () => {
    it("applique la saisie telle quelle (le dépôt gère $set/$unset) et lève UtilisateurIntrouvable si absent", async () => {
      const { deps } = creerDependances();
      const cas = creerCasDUsageUtilisateurs(deps);
      const { utilisateur } = await cas.creer(
        saisie({ username: "j", email: "j@srh.ci", role: "client", clientId: "client-1" })
      );
      expect(utilisateur.clientId).toEqual({ id: "client-1", nom: "Client" });

      const modifie = await cas.modifier(utilisateur.id, saisie({ username: "j", email: "j@srh.ci", role: "dispatcher" }));
      expect("clientId" in modifie).toBe(false);

      await expect(
        cas.modifier("inconnu", saisie({ username: "k", email: "k@srh.ci", role: "dispatcher" }))
      ).rejects.toBeInstanceOf(UtilisateurIntrouvable);
    });

    it("révoque les jetons en attente seulement si l'e-mail change (comparaison insensible à la casse)", async () => {
      const { deps, jetons } = creerDependances();
      const cas = creerCasDUsageUtilisateurs(deps);
      const { utilisateur } = await cas.creer(saisie({ username: "l", email: "l@srh.ci", role: "dispatcher" }));

      await cas.modifier(utilisateur.id, saisie({ username: "l", email: "l@srh.ci", role: "dispatcher" }));
      expect(jetons.revocations).toEqual([]);

      await cas.modifier(utilisateur.id, saisie({ username: "l", email: "L@SRH.CI", role: "dispatcher" }));
      expect(jetons.revocations).toEqual([]);

      await cas.modifier(utilisateur.id, saisie({ username: "l", email: "nouvel-email@srh.ci", role: "dispatcher" }));
      expect(jetons.revocations).toEqual([utilisateur.id]);
    });
  });

  describe("supprimer", () => {
    it("refuse la suppression de soi-même, AVANT tout appel au dépôt", async () => {
      const { deps, utilisateurs } = creerDependances();
      const cas = creerCasDUsageUtilisateurs(deps);
      const { utilisateur } = await cas.creer(saisie({ username: "n", email: "n@srh.ci", role: "dispatcher" }));

      await expect(cas.supprimer(utilisateur.id, utilisateur.id)).rejects.toBeInstanceOf(SuppressionDeSoiInterdite);
      expect(await utilisateurs.trouverParId(utilisateur.id)).not.toBeNull();
    });

    it("supprime un autre utilisateur, lève UtilisateurIntrouvable si absent", async () => {
      const { deps, utilisateurs } = creerDependances();
      const cas = creerCasDUsageUtilisateurs(deps);
      const { utilisateur } = await cas.creer(saisie({ username: "o", email: "o@srh.ci", role: "dispatcher" }));

      await cas.supprimer(utilisateur.id, "un-autre-id");
      expect(await utilisateurs.trouverParId(utilisateur.id)).toBeNull();
      await expect(cas.supprimer(utilisateur.id, "un-autre-id")).rejects.toBeInstanceOf(UtilisateurIntrouvable);
    });
  });

  describe("regenererMotDePasse", () => {
    it("régénère, hache, force mustChangePassword et passwordChangedAt, révoque les jetons", async () => {
      const { deps, jetons, utilisateurs } = creerDependances();
      const cas = creerCasDUsageUtilisateurs(deps);
      const { utilisateur } = await cas.creer(saisie({ username: "p", email: "p@srh.ci", role: "dispatcher" }));

      const { motDePasseGenere } = await cas.regenererMotDePasse(utilisateur.id);
      expect(typeof motDePasseGenere).toBe("string");

      const relu = await utilisateurs.trouverParId(utilisateur.id);
      expect(relu?.mustChangePassword).toBe(true);
      expect(relu?.passwordChangedAt).toBeInstanceOf(Date);
      expect(jetons.revocations).toEqual([utilisateur.id]);
    });

    it("lève UtilisateurIntrouvable pour un utilisateur inconnu", async () => {
      const { deps } = creerDependances();
      const cas = creerCasDUsageUtilisateurs(deps);
      await expect(cas.regenererMotDePasse("inconnu")).rejects.toBeInstanceOf(UtilisateurIntrouvable);
    });
  });

  describe("envoyerLienDeReinitialisation", () => {
    it("consulte le limiteur (scope send-link, limit 5, windowMs 1h) avant toute autre action", async () => {
      const appelsLimiteur: { scope: string; id: string; opts: { limit: number; windowMs: number } }[] = [];
      const limiteurDebit: LimiteurDebit = async (scope, id, opts) => {
        appelsLimiteur.push({ scope, id, opts });
        return { allowed: true, remaining: 4, retryAfterSeconds: 60 };
      };
      const { deps, jetons, envoisEnvoyes } = creerDependances({ limiteurDebit });
      const cas = creerCasDUsageUtilisateurs(deps);
      const { utilisateur } = await cas.creer(saisie({ username: "q", email: "q@srh.ci", role: "dispatcher" }));
      // Le premier appel (l'invitation) a déjà émis un jeton ; on ne s'intéresse qu'au second.
      const emissionsAvant = jetons.emissions.length;

      const resultat = await cas.envoyerLienDeReinitialisation(utilisateur.id);

      expect(resultat).toEqual({ statut: "envoye" });
      expect(appelsLimiteur).toEqual([{ scope: "send-link", id: utilisateur.id, opts: { limit: 5, windowMs: 3_600_000 } }]);
      expect(jetons.emissions.slice(emissionsAvant)).toEqual([{ userId: utilisateur.id, finalite: "reset" }]);
      expect(envoisEnvoyes.at(-1)?.to).toBe("q@srh.ci");
      expect(envoisEnvoyes.at(-1)?.subject).toBe("reinitialisation");
    });

    it("limite atteinte : renvoie le motif sans chercher l'utilisateur ni émettre de jeton", async () => {
      const limiteurDebit: LimiteurDebit = async () => ({ allowed: false, remaining: 0, retryAfterSeconds: 42 });
      const { deps, jetons } = creerDependances({ limiteurDebit });
      const cas = creerCasDUsageUtilisateurs(deps);

      const resultat = await cas.envoyerLienDeReinitialisation("un-id-quelconque");
      expect(resultat).toEqual({ statut: "limite_atteinte", retryApresSecondes: 42 });
      expect(jetons.emissions).toEqual([]);
    });

    it("une erreur du limiteur (service indisponible) se propage telle quelle, non capturée", async () => {
      const limiteurDebit: LimiteurDebit = async () => {
        throw new Error("indisponible");
      };
      const { deps } = creerDependances({ limiteurDebit });
      const cas = creerCasDUsageUtilisateurs(deps);
      await expect(cas.envoyerLienDeReinitialisation("un-id")).rejects.toThrow("indisponible");
    });

    it("utilisateur introuvable (après le contrôle du limiteur) : lève UtilisateurIntrouvable", async () => {
      const { deps } = creerDependances();
      const cas = creerCasDUsageUtilisateurs(deps);
      await expect(cas.envoyerLienDeReinitialisation("inconnu")).rejects.toBeInstanceOf(UtilisateurIntrouvable);
    });

    it("urlApplicative indisponible : non_envoye, aucun jeton émis", async () => {
      const { deps, jetons } = creerDependances();
      const cas = creerCasDUsageUtilisateurs(deps);
      const { utilisateur } = await cas.creer(saisie({ username: "r", email: "r@srh.ci", role: "dispatcher" }));
      const emissionsAvant = jetons.emissions.length;

      // Même dépôts (utilisateurs/jetons), mais une URL applicative qui lève.
      const casIndisponible = creerCasDUsageUtilisateurs({ ...deps, urlApplicative: urlApplicativeIndisponible });
      const resultat = await casIndisponible.envoyerLienDeReinitialisation(utilisateur.id);
      expect(resultat).toEqual({ statut: "non_envoye", motif: "not_configured" });
      expect(jetons.emissions.slice(emissionsAvant)).toEqual([]);
    });

    it("échec d'envoi du lien : non_envoye avec le motif", async () => {
      const envoiEmail: EnvoiEmail = async () => ({ ok: false, reason: "send_failed" });
      const { deps } = creerDependances({ envoiEmail });
      const cas = creerCasDUsageUtilisateurs(deps);
      const { utilisateur } = await cas.creer(saisie({ username: "s", email: "s@srh.ci", role: "dispatcher" }));

      const resultat = await cas.envoyerLienDeReinitialisation(utilisateur.id);
      expect(resultat).toEqual({ statut: "non_envoye", motif: "send_failed" });
    });

    it("émet un jeton de finalité reset (et non invitation)", async () => {
      const { deps, jetons } = creerDependances();
      const cas = creerCasDUsageUtilisateurs(deps);
      const { utilisateur } = await cas.creer(saisie({ username: "u", email: "u@srh.ci", role: "dispatcher" }));
      const emissionsAvant = jetons.emissions.length;

      await cas.envoyerLienDeReinitialisation(utilisateur.id);
      expect(jetons.emissions[emissionsAvant]).toEqual({ userId: utilisateur.id, finalite: "reset" });
    });
  });
});
