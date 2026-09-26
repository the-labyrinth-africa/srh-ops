import { describe, it, expect } from "vitest";
import { creerCasDUsageEmailDeTest, type DependancesEmailDeTest } from "./cas-d-usage-email-de-test";
import { UtilisateurIntrouvable, LimiteDeDebitAtteinte } from "../domain/erreurs";
import type { UtilisateurRepository, EnvoiEmail, LimiteurDebit, MessageEmail } from "../domain/ports";

// ---------------------------------------------------------------------------
// Faux en mémoire, locaux à ce fichier de test (même approche que
// cas-d-usage-mot-de-passe-oublie.test.ts).
// ---------------------------------------------------------------------------

interface UtilisateurFake {
  id: string;
  nom: string;
  email: string;
}

class UtilisateurRepositoryFake {
  constructor(private comptes: UtilisateurFake[]) {}

  async trouverParId(id: string) {
    const trouve = this.comptes.find((u) => u.id === id);
    return trouve ? { ...trouve } : null;
  }
}

function creerDependances(
  overrides: Partial<Pick<DependancesEmailDeTest, "envoiEmail" | "limiteurDebit">> & { comptes?: UtilisateurFake[] } = {}
) {
  const utilisateurs = new UtilisateurRepositoryFake(
    overrides.comptes ?? [{ id: "u1", nom: "Awa", email: "awa@srh.ci" }]
  ) as unknown as UtilisateurRepository;
  const envoisEnvoyes: MessageEmail[] = [];
  const envoiEmail: EnvoiEmail =
    overrides.envoiEmail ??
    (async (message) => {
      envoisEnvoyes.push(message);
      return { ok: true };
    });
  const limiteurDebit: LimiteurDebit =
    overrides.limiteurDebit ?? (async () => ({ allowed: true, remaining: 4, retryAfterSeconds: 60 }));

  const deps: DependancesEmailDeTest = { utilisateurs, envoiEmail, limiteurDebit };
  return { deps, envoisEnvoyes };
}

describe("cas d'usage de l'e-mail de test", () => {
  it("consulte le limiteur (scope mail-test, limit 5, windowMs 1h) avant toute autre action", async () => {
    const appels: { scope: string; id: string; opts: { limit: number; windowMs: number } }[] = [];
    const limiteurDebit: LimiteurDebit = async (scope, id, opts) => {
      appels.push({ scope, id, opts });
      return { allowed: true, remaining: 4, retryAfterSeconds: 60 };
    };
    const { deps } = creerDependances({ limiteurDebit });
    const cas = creerCasDUsageEmailDeTest(deps);

    await cas.envoyer("u1");
    expect(appels).toEqual([{ scope: "mail-test", id: "u1", opts: { limit: 5, windowMs: 3_600_000 } }]);
  });

  it("limite atteinte : lève LimiteDeDebitAtteinte sans chercher l'utilisateur ni envoyer d'e-mail", async () => {
    const limiteurDebit: LimiteurDebit = async () => ({ allowed: false, remaining: 0, retryAfterSeconds: 42 });
    const { deps, envoisEnvoyes } = creerDependances({ limiteurDebit });
    const cas = creerCasDUsageEmailDeTest(deps);

    const erreur = await cas.envoyer("u1").catch((e) => e);
    expect(erreur).toBeInstanceOf(LimiteDeDebitAtteinte);
    expect((erreur as LimiteDeDebitAtteinte).retryApresSecondes).toBe(42);
    expect(envoisEnvoyes).toEqual([]);
  });

  it("une erreur du limiteur (service indisponible) se propage telle quelle, non capturée", async () => {
    const limiteurDebit: LimiteurDebit = async () => {
      throw new Error("indisponible");
    };
    const { deps } = creerDependances({ limiteurDebit });
    const cas = creerCasDUsageEmailDeTest(deps);
    await expect(cas.envoyer("u1")).rejects.toThrow("indisponible");
  });

  it("utilisateur introuvable (après le contrôle du limiteur) : lève UtilisateurIntrouvable", async () => {
    const { deps } = creerDependances({ comptes: [] });
    const cas = creerCasDUsageEmailDeTest(deps);
    await expect(cas.envoyer("inconnu")).rejects.toBeInstanceOf(UtilisateurIntrouvable);
  });

  it("envoie l'e-mail exact (objet et corps, nom interpolé) à l'adresse de l'utilisateur", async () => {
    const { deps, envoisEnvoyes } = creerDependances({
      comptes: [{ id: "u1", nom: "Awa", email: "awa@srh.ci" }],
    });
    const cas = creerCasDUsageEmailDeTest(deps);

    const resultat = await cas.envoyer("u1");

    expect(resultat).toEqual({ ok: true });
    expect(envoisEnvoyes).toEqual([
      {
        to: "awa@srh.ci",
        subject: "SRH Ops — e-mail de test",
        text: "Bonjour Awa,\n\nCet e-mail confirme que l'envoi de messages depuis SRH Ops fonctionne.\n\nL'équipe SRH Ops",
      },
    ]);
  });

  it("renvoie le résultat d'échec de l'envoi tel quel (pas d'exception)", async () => {
    const envoiEmail: EnvoiEmail = async () => ({ ok: false, reason: "send_failed" });
    const { deps } = creerDependances({ envoiEmail });
    const cas = creerCasDUsageEmailDeTest(deps);

    const resultat = await cas.envoyer("u1");
    expect(resultat).toEqual({ ok: false, reason: "send_failed" });
  });
});
