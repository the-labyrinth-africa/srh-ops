import { describe, it, expect } from "vitest";
import {
  creerCasDUsageChangementMotDePasse,
  type DependancesChangementMotDePasse,
} from "./cas-d-usage-changement-mot-de-passe";
import { UtilisateurIntrouvable, MotDePasseActuelIncorrect, NouveauMotDePasseIdentique } from "../domain/erreurs";
import type { UtilisateurRepository, JetonRepository, HacheurMotDePasse } from "../domain/ports";

// ---------------------------------------------------------------------------
// Faux en mémoire, locaux à ce fichier de test.
// ---------------------------------------------------------------------------

interface UtilisateurFake {
  id: string;
  motDePasseHash: string;
  mustChangePassword?: boolean;
  passwordChangedAt?: Date;
}

class UtilisateurRepositoryFake implements Partial<UtilisateurRepository> {
  constructor(private comptes: Map<string, UtilisateurFake>) {}

  async trouverHashMotDePasse(id: string): Promise<string | null> {
    return this.comptes.get(id)?.motDePasseHash ?? null;
  }

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
    return { id: u.id, nom: "Nom", email: "u@srh.ci" };
  }
}

class JetonRepositoryFake implements Partial<JetonRepository> {
  revocations: string[] = [];
  async revoquerEnAttente(userId: string): Promise<void> {
    this.revocations.push(userId);
  }
}

function creerDependances() {
  const comptes = new Map<string, UtilisateurFake>([["u1", { id: "u1", motDePasseHash: "hache:AncienMdp1" }]]);
  const utilisateurs = new UtilisateurRepositoryFake(comptes) as unknown as UtilisateurRepository;
  const jetons = new JetonRepositoryFake() as unknown as JetonRepository & JetonRepositoryFake;
  const hacheur: HacheurMotDePasse = {
    hacher: async (mdp) => `hache:${mdp}`,
    comparer: async (mdp, hash) => hash === `hache:${mdp}`,
  };
  const deps: DependancesChangementMotDePasse = { utilisateurs, jetons, hacheur };
  return { deps, comptes, jetons };
}

describe("cas d'usage « changement de mot de passe »", () => {
  it("mot de passe actuel correct : change le mot de passe, révoque les jetons, ne pose JAMAIS passwordChangedAt", async () => {
    const { deps, comptes, jetons } = creerDependances();
    const cas = creerCasDUsageChangementMotDePasse(deps);

    await cas.changer("u1", "AncienMdp1", "NouveauMdp2");

    const u = comptes.get("u1")!;
    expect(u.motDePasseHash).toBe("hache:NouveauMdp2");
    expect(u.mustChangePassword).toBe(false);
    // Point de vigilance explicite : un changement volontaire ne doit jamais invalider la session
    // en cours (contrairement à une réinitialisation, qui pose passwordChangedAt).
    expect(u.passwordChangedAt).toBeUndefined();
    expect(jetons.revocations).toEqual(["u1"]);
  });

  it("utilisateur introuvable : lève UtilisateurIntrouvable", async () => {
    const { deps } = creerDependances();
    const cas = creerCasDUsageChangementMotDePasse(deps);
    await expect(cas.changer("inconnu", "x", "y")).rejects.toBeInstanceOf(UtilisateurIntrouvable);
  });

  it("mot de passe actuel incorrect : lève MotDePasseActuelIncorrect, rien n'est modifié", async () => {
    const { deps, comptes, jetons } = creerDependances();
    const cas = creerCasDUsageChangementMotDePasse(deps);

    await expect(cas.changer("u1", "Mauvais", "NouveauMdp2")).rejects.toBeInstanceOf(MotDePasseActuelIncorrect);
    expect(comptes.get("u1")!.motDePasseHash).toBe("hache:AncienMdp1");
    expect(jetons.revocations).toEqual([]);
  });

  it("nouveau mot de passe identique à l'actuel : lève NouveauMotDePasseIdentique, rien n'est modifié", async () => {
    const { deps, comptes, jetons } = creerDependances();
    const cas = creerCasDUsageChangementMotDePasse(deps);

    await expect(cas.changer("u1", "AncienMdp1", "AncienMdp1")).rejects.toBeInstanceOf(NouveauMotDePasseIdentique);
    expect(comptes.get("u1")!.motDePasseHash).toBe("hache:AncienMdp1");
    expect(jetons.revocations).toEqual([]);
  });
});
