import { describe, it, expect } from "vitest";
import type { Acteur } from "@/shared/acces/acteur";
import { USER_ROLES } from "@/shared/acces/roles";
// Oracle : les fonctions héritées que cette politique remplacera en 4b/4c.
import { isWithinClientScope, isWithinTeamScope, TEAM_SCOPE_ERROR } from "@/backend/comptes";
import {
  MESSAGE_CHAUFFEUR_SANS_EQUIPE,
  MESSAGE_HORS_EQUIPE,
  chauffeurSansEquipe,
  dansPerimetreClient,
  dansPerimetreEquipe,
  perimetreDeLecture,
  peutAgirSurOperation,
  peutVoirOperation,
} from "./visibilite";

const acteur = (role: Acteur["role"], rattachements: Partial<Acteur> = {}): Acteur => ({
  id: "u1",
  role,
  ...rattachements,
});

describe("périmètre client", () => {
  it.each(["admin", "dispatcher", "lecture", "chauffeur"] as const)("%s : aucune restriction de client", (role) => {
    expect(dansPerimetreClient(acteur(role), "client-a")).toBe(true);
    expect(dansPerimetreClient(acteur(role), undefined)).toBe(true);
  });

  it("un compte client ne voit que son client", () => {
    const client = acteur("client", { clientId: "client-a" });
    expect(dansPerimetreClient(client, "client-a")).toBe(true);
    expect(dansPerimetreClient(client, "client-b")).toBe(false);
    expect(dansPerimetreClient(client, undefined)).toBe(false);
    expect(dansPerimetreClient(client, null)).toBe(false);
  });

  it("un compte client sans périmètre ne voit rien", () => {
    expect(dansPerimetreClient(acteur("client"), undefined)).toBe(false);
    expect(dansPerimetreClient(acteur("client", { clientId: "" }), "")).toBe(false);
  });
});

describe("périmètre équipe", () => {
  it.each(["admin", "dispatcher", "lecture", "client"] as const)("%s : aucune restriction d'équipe", (role) => {
    expect(dansPerimetreEquipe(acteur(role), "equipe-a")).toBe(true);
    expect(dansPerimetreEquipe(acteur(role), undefined)).toBe(true);
  });

  it("un chauffeur n'agit que sur les opérations de son équipe", () => {
    const chauffeur = acteur("chauffeur", { equipeId: "equipe-a" });
    expect(dansPerimetreEquipe(chauffeur, "equipe-a")).toBe(true);
    expect(dansPerimetreEquipe(chauffeur, "equipe-b")).toBe(false);
  });

  it("une opération sans équipe, ou dont l'équipe a été supprimée, n'est visible d'aucun chauffeur", () => {
    const chauffeur = acteur("chauffeur", { equipeId: "equipe-a" });
    expect(dansPerimetreEquipe(chauffeur, undefined)).toBe(false);
    expect(dansPerimetreEquipe(chauffeur, null)).toBe(false);
    expect(dansPerimetreEquipe(chauffeur, "")).toBe(false);
  });

  it("un chauffeur sans équipe n'agit sur rien", () => {
    expect(dansPerimetreEquipe(acteur("chauffeur"), "equipe-a")).toBe(false);
    expect(dansPerimetreEquipe(acteur("chauffeur", { equipeId: "" }), "")).toBe(false);
  });
});

describe("chauffeurSansEquipe", () => {
  it("vrai seulement pour un chauffeur sans équipe", () => {
    expect(chauffeurSansEquipe(acteur("chauffeur"))).toBe(true);
    expect(chauffeurSansEquipe(acteur("chauffeur", { equipeId: "" }))).toBe(true);
    expect(chauffeurSansEquipe(acteur("chauffeur", { equipeId: "equipe-a" }))).toBe(false);
    expect(chauffeurSansEquipe(acteur("admin"))).toBe(false);
  });
});

describe("peutVoirOperation / peutAgirSurOperation", () => {
  const operation = { clientId: "client-a", equipeId: "equipe-a" };

  it("lecture : client ET équipe doivent être dans le périmètre", () => {
    expect(peutVoirOperation(acteur("admin"), operation)).toBe(true);
    expect(peutVoirOperation(acteur("client", { clientId: "client-a" }), operation)).toBe(true);
    expect(peutVoirOperation(acteur("client", { clientId: "client-b" }), operation)).toBe(false);
    expect(peutVoirOperation(acteur("chauffeur", { equipeId: "equipe-a" }), operation)).toBe(true);
    expect(peutVoirOperation(acteur("chauffeur", { equipeId: "equipe-b" }), operation)).toBe(false);
  });

  it("écriture terrain : seule l'équipe compte", () => {
    expect(peutAgirSurOperation(acteur("dispatcher"), operation)).toBe(true);
    expect(peutAgirSurOperation(acteur("chauffeur", { equipeId: "equipe-a" }), operation)).toBe(true);
    expect(peutAgirSurOperation(acteur("chauffeur", { equipeId: "equipe-b" }), operation)).toBe(false);
    expect(peutAgirSurOperation(acteur("chauffeur", { equipeId: "equipe-a" }), { clientId: "client-a" })).toBe(false);
  });
});

describe("perimetreDeLecture", () => {
  it("les rôles internes n'imposent aucun filtre", () => {
    for (const role of ["admin", "dispatcher", "lecture"] as const) {
      expect(perimetreDeLecture(acteur(role, { clientId: "client-a", equipeId: "equipe-a" }))).toEqual({});
    }
  });

  it("un compte client impose son client ; un chauffeur impose son équipe", () => {
    expect(perimetreDeLecture(acteur("client", { clientId: "client-a" }))).toEqual({ clientId: "client-a" });
    expect(perimetreDeLecture(acteur("chauffeur", { equipeId: "equipe-a" }))).toEqual({ equipeId: "equipe-a" });
  });
});

describe("messages", () => {
  it("sont ceux des routes actuelles, au mot près", () => {
    expect(MESSAGE_HORS_EQUIPE).toBe(TEAM_SCOPE_ERROR);
    expect(MESSAGE_CHAUFFEUR_SANS_EQUIPE).toBe("Compte chauffeur sans équipe attribuée");
  });
});

// Filet de parité : à supprimer avec les fonctions héritées quand plus aucune route ne les utilise.
describe("parité avec les fonctions héritées de comptes/http/acteur.ts", () => {
  const rattachementsActeur = [undefined, "", "aaa"];
  const rattachementsDocument = [undefined, null, "", "aaa", "bbb"];

  for (const role of USER_ROLES) {
    for (const propre of rattachementsActeur) {
      for (const document of rattachementsDocument) {
        it(`${role} / acteur=${JSON.stringify(propre)} / document=${JSON.stringify(document)}`, () => {
          const herite = { role, clientId: propre, equipeId: propre } as never;
          const a = acteur(role, { clientId: propre, equipeId: propre });
          expect(dansPerimetreClient(a, document)).toBe(isWithinClientScope(herite, document));
          expect(dansPerimetreEquipe(a, document)).toBe(isWithinTeamScope(herite, document));
        });
      }
    }
  }
});
