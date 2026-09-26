import { describe, it, expect } from "vitest";
import { creerCasDUsageMotDePasseOublie, type DependancesMotDePasseOublie } from "./cas-d-usage-mot-de-passe-oublie";
import { LimiteDeDebitAtteinte } from "../domain/erreurs";
import type {
  UtilisateurRepository,
  JetonRepository,
  JetonFinalite,
  EnvoiEmail,
  LimiteurDebit,
  ExecutionDifferee,
  Horloge,
  UrlApplicative,
  GabaritsEmail,
} from "../domain/ports";
import type { MailMessage } from "@/backend/platform/email/types";

// ---------------------------------------------------------------------------
// Faux en mémoire, locaux à ce fichier de test (même approche que
// cas-d-usage-utilisateurs.test.ts).
// ---------------------------------------------------------------------------

interface UtilisateurFake {
  id: string;
  nom: string;
  email: string;
}

class UtilisateurRepositoryFake implements Partial<UtilisateurRepository> {
  constructor(private comptes: UtilisateurFake[]) {}

  async trouverProjectionParIdentifiant(identifiant: string) {
    const normalise = identifiant.trim().toLowerCase();
    const trouve = this.comptes.find((u) =>
      normalise.includes("@") ? u.email === normalise : u.email.split("@")[0] === normalise
    );
    return trouve ? { id: trouve.id, nom: trouve.nom, email: trouve.email } : null;
  }
}

class JetonRepositoryFake implements Partial<JetonRepository> {
  emissions: { userId: string; finalite: JetonFinalite }[] = [];

  async emettre(userId: string, finalite: JetonFinalite, maintenant: Date) {
    this.emissions.push({ userId, finalite });
    return { token: `jeton-${this.emissions.length}`, expiresAt: new Date(maintenant.getTime() + 1000) };
  }
}

const URL_VALIDE = "https://ops.example.test";

function creerDependances(
  overrides: Partial<DependancesMotDePasseOublie> & { comptes?: UtilisateurFake[] } = {}
) {
  const utilisateurs = new UtilisateurRepositoryFake(
    overrides.comptes ?? [{ id: "u1", nom: "Awa", email: "awa@srh.ci" }]
  ) as unknown as UtilisateurRepository;
  const jetons = new JetonRepositoryFake() as unknown as JetonRepository;
  const envoisEnvoyes: MailMessage[] = [];
  const envoiEmail: EnvoiEmail =
    overrides.envoiEmail ??
    (async (message: MailMessage) => {
      envoisEnvoyes.push(message);
      return { ok: true };
    });
  const appelsLimiteur: { scope: string; valeur: string }[] = [];
  const limiteurDebit: LimiteurDebit =
    overrides.limiteurDebit ??
    (async (scope, valeur) => {
      appelsLimiteur.push({ scope, valeur });
      return { allowed: true, remaining: 4, retryAfterSeconds: 60 };
    });
  // Simule `runAfterResponse` : exécute la tâche, avale toute erreur (jamais propagée à l'appelant).
  const executionDifferee: ExecutionDifferee =
    overrides.executionDifferee ??
    (async (task) => {
      try {
        await task();
      } catch {
        // avalé, comme `runAfterResponse` réel
      }
    });
  const horloge: Horloge = overrides.horloge ?? { maintenant: () => new Date("2026-01-01T00:00:00.000Z") };
  const urlApplicative: UrlApplicative = overrides.urlApplicative ?? (() => URL_VALIDE);
  const gabarits: GabaritsEmail =
    overrides.gabarits ??
    ({
      invitation: (d, lien) => ({ to: d.email, subject: "invitation", text: lien }),
      reinitialisation: (d, lien) => ({ to: d.email, subject: "reinitialisation", text: lien }),
      motDePasseModifie: (d) => ({ to: d.email, subject: "mot-de-passe-modifie", text: "" }),
    } satisfies GabaritsEmail);

  const deps: DependancesMotDePasseOublie = {
    utilisateurs,
    jetons,
    envoiEmail,
    limiteurDebit,
    executionDifferee,
    horloge,
    urlApplicative,
    gabarits,
  };
  return { deps, jetons: jetons as unknown as JetonRepositoryFake, envoisEnvoyes, appelsLimiteur };
}

describe("cas d'usage « mot de passe oublié »", () => {
  it("compte existant : émet un jeton reset et envoie l'e-mail (gabarit reinitialisation), après la réponse", async () => {
    const { deps, jetons, envoisEnvoyes } = creerDependances();
    const cas = creerCasDUsageMotDePasseOublie(deps);

    await expect(cas.demander("awa@srh.ci", "203.0.113.10")).resolves.toBeUndefined();

    expect(jetons.emissions).toEqual([{ userId: "u1", finalite: "reset" }]);
    expect(envoisEnvoyes).toHaveLength(1);
    expect(envoisEnvoyes[0].to).toBe("awa@srh.ci");
    expect(envoisEnvoyes[0].subject).toBe("reinitialisation");
  });

  it("compte inexistant : ne lève jamais, aucun jeton, aucun envoi — indiscernable du cas précédent", async () => {
    const { deps, jetons, envoisEnvoyes } = creerDependances();
    const cas = creerCasDUsageMotDePasseOublie(deps);

    await expect(cas.demander("inconnu@srh.ci", "203.0.113.10")).resolves.toBeUndefined();

    expect(jetons.emissions).toEqual([]);
    expect(envoisEnvoyes).toEqual([]);
  });

  it("consulte les deux limiteurs (forgot-ip et forgot-id) avec les bonnes bornes", async () => {
    const { deps, appelsLimiteur } = creerDependances();
    const cas = creerCasDUsageMotDePasseOublie(deps);

    await cas.demander("Awa@SRH.CI", "203.0.113.10");

    expect(appelsLimiteur).toEqual(
      expect.arrayContaining([
        { scope: "forgot-ip", valeur: "203.0.113.10" },
        { scope: "forgot-id", valeur: "awa@srh.ci" },
      ])
    );
  });

  it("limite atteinte (IP ou identifiant) : lève LimiteDeDebitAtteinte, aucun jeton ni envoi", async () => {
    const limiteurDebit: LimiteurDebit = async (scope) => ({
      allowed: scope !== "forgot-id",
      remaining: 0,
      retryAfterSeconds: scope === "forgot-id" ? 42 : 5,
    });
    const { deps, jetons, envoisEnvoyes } = creerDependances({ limiteurDebit });
    const cas = creerCasDUsageMotDePasseOublie(deps);

    await expect(cas.demander("awa@srh.ci", "203.0.113.10")).rejects.toEqual(new LimiteDeDebitAtteinte(42));
    expect(jetons.emissions).toEqual([]);
    expect(envoisEnvoyes).toEqual([]);
  });

  it("limiteur en échec (service indisponible) : avalé silencieusement, ne lève pas, aucun jeton ni envoi — contraste avec la réinitialisation", async () => {
    const limiteurDebit: LimiteurDebit = async () => {
      throw new Error("connexion indisponible");
    };
    const { deps, jetons, envoisEnvoyes } = creerDependances({ limiteurDebit });
    const cas = creerCasDUsageMotDePasseOublie(deps);

    await expect(cas.demander("awa@srh.ci", "203.0.113.10")).resolves.toBeUndefined();
    expect(jetons.emissions).toEqual([]);
    expect(envoisEnvoyes).toEqual([]);
  });

  it("urlApplicative indisponible : aucun jeton n'est émis, aucun envoi (le jeton précédent reste valide)", async () => {
    const urlApplicative: UrlApplicative = () => {
      throw new Error("NEXTAUTH_URL n'est pas défini");
    };
    const { deps, jetons, envoisEnvoyes } = creerDependances({ urlApplicative });
    const cas = creerCasDUsageMotDePasseOublie(deps);

    await expect(cas.demander("awa@srh.ci", "203.0.113.10")).resolves.toBeUndefined();
    expect(jetons.emissions).toEqual([]);
    expect(envoisEnvoyes).toEqual([]);
  });

  it("la recherche, l'émission et l'envoi passent par executionDifferee (pas exécutés en direct)", async () => {
    let appele = false;
    const executionDifferee: ExecutionDifferee = async (task) => {
      appele = true;
      await task();
    };
    const { deps, jetons } = creerDependances({ executionDifferee });
    const cas = creerCasDUsageMotDePasseOublie(deps);

    await cas.demander("awa@srh.ci", "203.0.113.10");
    expect(appele).toBe(true);
    expect(jetons.emissions).toEqual([{ userId: "u1", finalite: "reset" }]);
  });
});
