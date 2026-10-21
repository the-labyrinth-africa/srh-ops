import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { GET as obtenirIdentite, PUT as modifierIdentite } from "@/app/api/plateforme/entreprise/route";
import { GET as obtenirUnite } from "@/app/api/plateforme/unite-quantite/route";
import { IdentiteEntrepriseModel } from "@/backend/identite-entreprise/infrastructure/mongoose/identite-entreprise.model";

function session(role: "admin" | "superadmin") {
  vi.mocked(nextAuth.getServerSession).mockResolvedValue({
    user: {
      id: "507f1f77bcf86cd799439011",
      name: "Compte plateforme",
      email: "plateforme@example.test",
      role,
      mustChangePassword: false,
    },
  } as never);
}

function formRequest(fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new NextRequest("http://localhost:3000/api/plateforme/entreprise", { method: "PUT", body: form });
}

const identite = (uniteQuantiteGlobale: string) => ({
  nomEntreprise: "Entreprise Exemple",
  sigle: "EX",
  siteWeb: "https://exemple.test",
  uniteQuantiteGlobale,
});

describe("configuration globale de l'unité de quantité", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    session("superadmin");
  });

  it("renvoie une configuration nulle par défaut avec des réponses privées non mises en cache", async () => {
    const [reponseIdentite, reponseUnite] = await Promise.all([obtenirIdentite(), obtenirUnite()]);

    expect(reponseIdentite.status).toBe(200);
    expect((await reponseIdentite.json()).uniteQuantiteGlobale).toBeNull();
    expect(reponseUnite.status).toBe(200);
    expect(await reponseUnite.json()).toEqual({ uniteQuantiteGlobale: null });
    expect(reponseUnite.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it.each(["Litres", "Kg", "M3", "Bacs"] as const)("enregistre %s et la restitue par les deux API", async (unite) => {
    const response = await modifierIdentite(formRequest(identite(unite)));

    expect(response.status).toBe(200);
    expect((await response.json()).uniteQuantiteGlobale).toBe(unite);
    expect(await IdentiteEntrepriseModel.findOne({ cle: "principale" }).lean()).toMatchObject({
      uniteQuantiteGlobale: unite,
    });
    expect(await (await obtenirUnite()).json()).toEqual({ uniteQuantiteGlobale: unite });
    expect((await (await obtenirIdentite()).json()).uniteQuantiteGlobale).toBe(unite);
  });

  it("préserve l'unité si le formulaire ne contient pas le champ, et la désactive si le champ est vide", async () => {
    await modifierIdentite(formRequest(identite("Kg")));

    const sansChamp = await modifierIdentite(
      formRequest({ nomEntreprise: "Entreprise Exemple", sigle: "EX", siteWeb: "https://exemple.test" })
    );
    expect((await sansChamp.json()).uniteQuantiteGlobale).toBe("Kg");

    const vide = await modifierIdentite(formRequest(identite("")));
    expect((await vide.json()).uniteQuantiteGlobale).toBeNull();
    expect(await (await obtenirUnite()).json()).toEqual({ uniteQuantiteGlobale: null });
  });

  it("refuse les unités invalides et réserve la modification au superadministrateur", async () => {
    const invalide = await modifierIdentite(formRequest(identite("Tonnes")));
    expect(invalide.status).toBe(400);

    session("admin");
    const interdit = await modifierIdentite(formRequest(identite("Kg")));
    expect(interdit.status).toBe(403);
    expect(await IdentiteEntrepriseModel.countDocuments()).toBe(0);
  });
});
