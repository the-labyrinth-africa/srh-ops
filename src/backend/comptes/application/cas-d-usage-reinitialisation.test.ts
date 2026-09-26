import { describe, it, expect } from "vitest";
import { creerCasDUsageReinitialisation, type DependancesReinitialisation } from "./cas-d-usage-reinitialisation";
import {
  creerCasDUsageMotDePasseOublie,
  type DependancesMotDePasseOublie,
} from "./cas-d-usage-mot-de-passe-oublie";
import { LimiteDeDebitAtteinte, LienInvalideOuExpire } from "../domain/erreurs";
import type {
  UtilisateurRepository,
  JetonRepository,
  JetonFinalite,
  HacheurMotDePasse,
  EnvoiEmail,
  ExecutionDifferee,
  LimiteurDebit,
  Horloge,
  GabaritsEmail,
} from "../domain/ports";
import type { MailMessage } from "@/backend/platform/email/types";

// ---------------------------------------------------------------------------
// Faux en mémoire, locaux à ce fichier de test.
// ---------------------------------------------------------------------------

interface JetonFake {
  token: string;
  userId: string;
  finalite: JetonFinalite;
  consomme: boolean;
}

class JetonRepositoryFake implements Partial<JetonRepository> {
  jetons: JetonFake[] = [];
  revocations: string[] = [];

  emettreDirect(userId: string, finalite: JetonFinalite): string {
    const token = `jeton-${this.jetons.length + 1}`;
    this.jetons.push({ token, userId, finalite, consomme: false });
    return token;
  }

  async consommer(token: string): Promise<{ userId: string; finalite: JetonFinalite } | null> {
    const trouve = this.jetons.find((j) => j.token === token && !j.consomme);
    if (!trouve) return null;
    trouve.consomme = true;
    return { userId: trouve.userId, finalite: trouve.finalite };
  }

  async revoquerEnAttente(userId: string): Promise<void> {
    this.revocations.push(userId);
    for (const j of this.jetons) if (j.userId === userId && !j.consomme) j.consomme = true;
  }
}

interface UtilisateurFake {
  id: string;
  nom: string;
  email: string;
  motDePasseHash?: string;
  mustChangePassword?: boolean;
  passwordChangedAt?: Date;
}

class UtilisateurRepositoryFake implements Partial<UtilisateurRepository> {
  constructor(private comptes: Map<string, UtilisateurFake>) {}

  async changerMotDePasse(
    id: string,
    motDePasseHash: string,
    options: { mustChangePassword: boolean; poserPasswordChangedAt: boolean }
  ) {
    const u = this.comptes.get(id);
    if (!u) return null;
    u.motDePasseHash = motDePasseHash;
    u.mustChangePassword = options.mustChangePassword;
    if (options.poserPasswordChangedAt) u.passwordChangedAt = new Date();
    return { id: u.id, nom: u.nom, email: u.email };
  }
}

function creerDependances(overrides: Partial<DependancesReinitialisation> = {}) {
  const comptes = new Map<string, UtilisateurFake>([["u1", { id: "u1", nom: "Awa", email: "awa@srh.ci" }]]);
  const utilisateurs = new UtilisateurRepositoryFake(comptes) as unknown as UtilisateurRepository;
  const jetons = new JetonRepositoryFake() as unknown as JetonRepository & JetonRepositoryFake;
  const hacheur: HacheurMotDePasse = {
    hacher: async (mdp) => `hache:${mdp}`,
    comparer: async (mdp, hash) => hash === `hache:${mdp}`,
  };
  const envoisEnvoyes: MailMessage[] = [];
  const envoiEmail: EnvoiEmail =
    overrides.envoiEmail ??
    (async (message: MailMessage) => {
      envoisEnvoyes.push(message);
      return { ok: true };
    });
  const executionDifferee: ExecutionDifferee =
    overrides.executionDifferee ??
    (async (task) => {
      try {
        await task();
      } catch {
        // avalé, comme `runAfterResponse` réel
      }
    });
  const limiteurDebit: LimiteurDebit =
    overrides.limiteurDebit ?? (async () => ({ allowed: true, remaining: 19, retryAfterSeconds: 60 }));
  const horloge: Horloge = overrides.horloge ?? { maintenant: () => new Date("2026-01-01T00:00:00.000Z") };
  const gabarits: GabaritsEmail =
    overrides.gabarits ??
    ({
      invitation: (d, lien) => ({ to: d.email, subject: "invitation", text: lien }),
      reinitialisation: (d, lien) => ({ to: d.email, subject: "reinitialisation", text: lien }),
      motDePasseModifie: (d) => ({ to: d.email, subject: "mot-de-passe-modifie", text: "" }),
    } satisfies GabaritsEmail);

  const deps: DependancesReinitialisation = {
    utilisateurs,
    jetons,
    hacheur,
    envoiEmail,
    executionDifferee,
    limiteurDebit,
    horloge,
    gabarits,
  };
  return { deps, jetons, comptes, envoisEnvoyes };
}

const IP = "198.51.100.7";

describe("cas d'usage « réinitialisation »", () => {
  describe("verifierLimiteDeDebit", () => {
    // Séparée de `reinitialiser` précisément pour que le contrôleur puisse l'appeler avant de lire
    // le corps de la requête (ordre exact de la route d'origine) — testée isolément ici.

    it("appelle le limiteur avec la bonne portée (reset-ip, 20/h)", async () => {
      const appels: { scope: string; valeur: string; opts: unknown }[] = [];
      const limiteurDebit: LimiteurDebit = async (scope, valeur, opts) => {
        appels.push({ scope, valeur, opts });
        return { allowed: true, remaining: 19, retryAfterSeconds: 60 };
      };
      const { deps } = creerDependances({ limiteurDebit });
      const cas = creerCasDUsageReinitialisation(deps);

      await cas.verifierLimiteDeDebit(IP);
      expect(appels).toEqual([{ scope: "reset-ip", valeur: IP, opts: { limit: 20, windowMs: 3_600_000 } }]);
    });

    it("limite atteinte : lève LimiteDeDebitAtteinte", async () => {
      const limiteurDebit: LimiteurDebit = async () => ({ allowed: false, remaining: 0, retryAfterSeconds: 33 });
      const { deps } = creerDependances({ limiteurDebit });
      const cas = creerCasDUsageReinitialisation(deps);

      await expect(cas.verifierLimiteDeDebit(IP)).rejects.toEqual(new LimiteDeDebitAtteinte(33));
    });

    it("limiteur en échec (service indisponible) : l'erreur se propage telle quelle (échec fermé), contrairement à « mot de passe oublié » qui l'avale", async () => {
      const erreur = new Error("connexion indisponible");
      const limiteurDebit: LimiteurDebit = async () => {
        throw erreur;
      };
      const { deps } = creerDependances({ limiteurDebit });
      const cas = creerCasDUsageReinitialisation(deps);

      await expect(cas.verifierLimiteDeDebit(IP)).rejects.toThrow("connexion indisponible");
    });
  });

  describe("reinitialiser", () => {
    it("jeton reset valide : change le mot de passe, lève mustChangePassword et pose passwordChangedAt, révoque les jetons, prévient par e-mail", async () => {
      const { deps, jetons, comptes, envoisEnvoyes } = creerDependances();
      const token = jetons.emettreDirect("u1", "reset");
      const cas = creerCasDUsageReinitialisation(deps);

      await cas.reinitialiser(token, "NouveauMdp2");

      const u = comptes.get("u1")!;
      expect(u.motDePasseHash).toBe("hache:NouveauMdp2");
      expect(u.mustChangePassword).toBe(false);
      expect(u.passwordChangedAt).toBeInstanceOf(Date);
      expect(jetons.revocations).toEqual(["u1"]);
      expect(envoisEnvoyes).toHaveLength(1);
      expect(envoisEnvoyes[0].subject).toBe("mot-de-passe-modifie");
    });

    it("jeton invitation valide : active le compte sans envoyer d'e-mail « mot de passe modifié »", async () => {
      const { deps, jetons, envoisEnvoyes } = creerDependances();
      const token = jetons.emettreDirect("u1", "invitation");
      const cas = creerCasDUsageReinitialisation(deps);

      await cas.reinitialiser(token, "NouveauMdp2");
      expect(envoisEnvoyes).toEqual([]);
    });

    it("jeton inconnu, mal formé ou déjà consommé : lève LienInvalideOuExpire, mot de passe intact", async () => {
      const { deps, comptes } = creerDependances();
      const cas = creerCasDUsageReinitialisation(deps);

      await expect(cas.reinitialiser("jeton-inexistant", "NouveauMdp2")).rejects.toBeInstanceOf(
        LienInvalideOuExpire
      );
      expect(comptes.get("u1")!.motDePasseHash).toBeUndefined();
    });

    it("le jeton ne sert qu'une fois : le second essai est refusé", async () => {
      const { deps, jetons } = creerDependances();
      const token = jetons.emettreDirect("u1", "reset");
      const cas = creerCasDUsageReinitialisation(deps);

      await cas.reinitialiser(token, "NouveauMdp2");
      await expect(cas.reinitialiser(token, "AutreMdp3")).rejects.toBeInstanceOf(LienInvalideOuExpire);
    });

    it("l'envoi de l'e-mail « mot de passe modifié » passe par executionDifferee (pas exécuté en direct)", async () => {
      let appele = false;
      const executionDifferee: ExecutionDifferee = async (task) => {
        appele = true;
        await task();
      };
      const { deps, jetons, envoisEnvoyes } = creerDependances({ executionDifferee });
      const token = jetons.emettreDirect("u1", "reset");
      const cas = creerCasDUsageReinitialisation(deps);

      await cas.reinitialiser(token, "NouveauMdp2");
      expect(appele).toBe(true);
      expect(envoisEnvoyes).toHaveLength(1);
    });
  });

  it("contraste fail-open/fail-closed : la même panne de limiteur est avalée par « mot de passe oublié » mais propagée par « réinitialisation »", async () => {
    const panne = new Error("connexion indisponible");
    const limiteurDebit: LimiteurDebit = async () => {
      throw panne;
    };

    const { deps: depsReinitialisation } = creerDependances({ limiteurDebit });
    const casReinitialisation = creerCasDUsageReinitialisation(depsReinitialisation);
    await expect(casReinitialisation.verifierLimiteDeDebit(IP)).rejects.toThrow("connexion indisponible");

    const depsMotDePasseOublie: DependancesMotDePasseOublie = {
      utilisateurs: { trouverProjectionParIdentifiant: async () => null } as unknown as UtilisateurRepository,
      jetons: {} as JetonRepository,
      envoiEmail: async () => ({ ok: true }),
      limiteurDebit,
      executionDifferee: async (task) => {
        await task();
      },
      horloge: { maintenant: () => new Date("2026-01-01T00:00:00.000Z") },
      urlApplicative: () => "https://ops.example.test",
      gabarits: {
        invitation: (d, lien) => ({ to: d.email, subject: "invitation", text: lien }),
        reinitialisation: (d, lien) => ({ to: d.email, subject: "reinitialisation", text: lien }),
        motDePasseModifie: (d) => ({ to: d.email, subject: "mot-de-passe-modifie", text: "" }),
      },
    };
    const casMotDePasseOublie = creerCasDUsageMotDePasseOublie(depsMotDePasseOublie);
    await expect(casMotDePasseOublie.demander("awa@srh.ci", IP)).resolves.toBeUndefined();
  });
});
