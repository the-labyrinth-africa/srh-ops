import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { GET as listerEquipes, POST as creerEquipe } from "@/app/api/equipes/route";
import { GET as lireEquipe, PUT as modifierEquipe, DELETE as supprimerEquipe } from "@/app/api/equipes/[id]/route";
import { User } from "@/backend/comptes/infrastructure/mongoose/utilisateur.model";

/**
 * Caractérisation des 5 routes `/api/equipes` : ces tests figent le comportement HTTP
 * observable (statuts, corps JSON, messages, ordre des contrôles) avant la migration
 * hexagonale du domaine. Ils ne dépendent que des routes et du modèle User.
 */

const ID_INCONNU = "507f1f77bcf86cd799439099";
const CLES_EQUIPE = ["_id", "createdAt", "disponibilite", "membres", "nom", "updatedAt", "__v"].sort();

function session(user: Record<string, unknown> | null) {
  vi.mocked(nextAuth.getServerSession).mockResolvedValue(
    (user
      ? { user: { id: "507f1f77bcf86cd799439011", name: "U", email: "u@srh.ci", username: "u", ...user } }
      : null) as never
  );
}

const asAdmin = () => session({ role: "admin" });

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (method: string, url: string, body: unknown) =>
  new NextRequest(`http://localhost:3000${url}`, { method, body: JSON.stringify(body) });
const post = (body: unknown) => json("POST", "/api/equipes", body);
const put = (id: string, body: unknown) => json("PUT", `/api/equipes/${id}`, body);
const vide = (method: string, id: string) =>
  new NextRequest(`http://localhost:3000/api/equipes/${id}`, { method });

async function creer(body: unknown = { nom: "Équipe A", membres: ["Awa"], disponibilite: false }) {
  const res = await creerEquipe(post(body));
  expect(res.status).toBe(201);
  return (await res.json()) as Record<string, unknown> & { _id: string };
}

describe("equipes — caractérisation de l'API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    asAdmin();
  });

  describe("GET /api/equipes", () => {
    it("liste vide -> 200 et tableau vide", async () => {
      const res = await listerEquipes();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it("renvoie les équipes triées par nom croissant, avec la forme JSON historique", async () => {
      await creer({ nom: "Zeta" });
      await creer({ nom: "Alpha" });
      await creer({ nom: "Mike" });
      const res = await listerEquipes();
      expect(res.status).toBe(200);
      const liste = await res.json();
      expect(liste.map((e: { nom: string }) => e.nom)).toEqual(["Alpha", "Mike", "Zeta"]);
      for (const e of liste) expect(Object.keys(e).sort()).toEqual(CLES_EQUIPE);
    });

    it("renvoie les valeurs saisies (pas seulement les noms) et des dates/révisions cohérentes", async () => {
      await creer({ nom: "Zeta", membres: ["Awa", "Koffi"], disponibilite: false });
      await creer({ nom: "Alpha" });
      const liste = await (await listerEquipes()).json();
      expect(liste).toHaveLength(2);
      const [alpha, zeta] = liste;
      expect(alpha).toMatchObject({ nom: "Alpha", membres: [], disponibilite: true, __v: 0 });
      expect(zeta).toMatchObject({ nom: "Zeta", membres: ["Awa", "Koffi"], disponibilite: false, __v: 0 });
      for (const e of liste) {
        expect(e._id).toMatch(/^[a-f\d]{24}$/);
        expect(new Date(e.createdAt).toISOString()).toBe(e.createdAt);
        expect(e.updatedAt).toBe(e.createdAt);
      }
      expect(alpha._id).not.toBe(zeta._id);
    });

    it("401 sans session", async () => {
      session(null);
      const res = await listerEquipes();
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Non authentifié" });
    });

    it("403 pour un chauffeur", async () => {
      session({ role: "chauffeur", equipeId: ID_INCONNU });
      const res = await listerEquipes();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Accès refusé" });
    });

    it("403 pour un client", async () => {
      session({ role: "client", clientId: ID_INCONNU });
      const res = await listerEquipes();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Accès refusé" });
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await listerEquipes();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: "Changement de mot de passe requis",
        code: "MUST_CHANGE_PASSWORD",
      });
    });

    it("un rôle lecture peut lister", async () => {
      session({ role: "lecture" });
      expect((await listerEquipes()).status).toBe(200);
    });
  });

  describe("POST /api/equipes", () => {
    it("201 avec l'ensemble exact des clés (_id, nom, membres, disponibilite, createdAt, updatedAt, __v)", async () => {
      const res = await creerEquipe(post({ nom: "Équipe Bravo", membres: ["Kouassi", "Traoré"], disponibilite: false }));
      expect(res.status).toBe(201);
      const corps = await res.json();
      expect(Object.keys(corps).sort()).toEqual(CLES_EQUIPE);
      expect(corps._id).toMatch(/^[a-f\d]{24}$/);
      expect(corps.nom).toBe("Équipe Bravo");
      expect(corps.membres).toEqual(["Kouassi", "Traoré"]);
      expect(corps.disponibilite).toBe(false);
      expect(corps.__v).toBe(0);
      expect(new Date(corps.createdAt).toISOString()).toBe(corps.createdAt);
      expect(corps.updatedAt).toBe(corps.createdAt);
    });

    it("applique les valeurs par défaut (membres [], disponibilite true)", async () => {
      const corps = await creer({ nom: "Seule" });
      expect(corps.membres).toEqual([]);
      expect(corps.disponibilite).toBe(true);
    });

    it("400 si le nom est vide, avec le détail Zod aplati", async () => {
      const res = await creerEquipe(post({ nom: "" }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: { formErrors: [], fieldErrors: { nom: ["Le nom est requis"] } },
      });
      expect(await (await listerEquipes()).json()).toEqual([]);
    });

    it("400 si le corps est invalide (types)", async () => {
      const res = await creerEquipe(post({ nom: "X", membres: "pas un tableau" }));
      expect(res.status).toBe(400);
      expect((await res.json()).error.fieldErrors.membres).toBeDefined();
    });

    it("401 sans session", async () => {
      session(null);
      expect((await creerEquipe(post({ nom: "X" }))).status).toBe(401);
    });

    it("403 pour un chauffeur et pour un client", async () => {
      session({ role: "chauffeur", equipeId: ID_INCONNU });
      expect((await creerEquipe(post({ nom: "X" }))).status).toBe(403);
      session({ role: "client", clientId: ID_INCONNU });
      expect((await creerEquipe(post({ nom: "X" }))).status).toBe(403);
    });

    it("403 « Permission insuffisante » pour un rôle lecture (écriture refusée)", async () => {
      session({ role: "lecture" });
      const res = await creerEquipe(post({ nom: "X" }));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Permission insuffisante" });
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await creerEquipe(post({ nom: "X" }));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("MUST_CHANGE_PASSWORD");
    });

    it("le contrôle d'accès passe avant la validation du corps (403 même avec un corps invalide)", async () => {
      session({ role: "lecture" });
      expect((await creerEquipe(post({ nom: "" }))).status).toBe(403);
    });
  });

  describe("GET /api/equipes/[id]", () => {
    it("200 avec la forme JSON exacte", async () => {
      const creee = await creer();
      const res = await lireEquipe(vide("GET", creee._id), ctx(creee._id));
      expect(res.status).toBe(200);
      const corps = await res.json();
      expect(Object.keys(corps).sort()).toEqual(CLES_EQUIPE);
      expect(corps).toEqual(creee);
    });

    it("404 « Non trouvé » pour un identifiant valide inconnu", async () => {
      const res = await lireEquipe(vide("GET", ID_INCONNU), ctx(ID_INCONNU));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Non trouvé" });
    });

    it("400 « Identifiant invalide » pour un identifiant mal formé", async () => {
      const res = await lireEquipe(vide("GET", "pas-un-id"), ctx("pas-un-id"));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Identifiant invalide" });
    });

    it("401 sans session, 403 chauffeur, 403 client", async () => {
      const creee = await creer();
      session(null);
      expect((await lireEquipe(vide("GET", creee._id), ctx(creee._id))).status).toBe(401);
      session({ role: "chauffeur", equipeId: creee._id });
      expect((await lireEquipe(vide("GET", creee._id), ctx(creee._id))).status).toBe(403);
      session({ role: "client", clientId: ID_INCONNU });
      expect((await lireEquipe(vide("GET", creee._id), ctx(creee._id))).status).toBe(403);
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await lireEquipe(vide("GET", ID_INCONNU), ctx(ID_INCONNU));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("MUST_CHANGE_PASSWORD");
    });

    it("l'authentification passe avant la garde d'identifiant (401 avec un id invalide)", async () => {
      session(null);
      expect((await lireEquipe(vide("GET", "x"), ctx("x"))).status).toBe(401);
    });
  });

  describe("PUT /api/equipes/[id]", () => {
    it("200 : remplace les champs, conserve _id/createdAt, avance updatedAt, __v inchangé", async () => {
      const creee = await creer();
      await new Promise((r) => setTimeout(r, 5));
      const res = await modifierEquipe(
        put(creee._id, { nom: "Renommée", membres: ["x", "y"], disponibilite: true }),
        ctx(creee._id)
      );
      expect(res.status).toBe(200);
      const corps = await res.json();
      expect(Object.keys(corps).sort()).toEqual(CLES_EQUIPE);
      expect(corps._id).toBe(creee._id);
      expect(corps.nom).toBe("Renommée");
      expect(corps.membres).toEqual(["x", "y"]);
      expect(corps.disponibilite).toBe(true);
      expect(corps.createdAt).toBe(creee.createdAt);
      expect(new Date(corps.updatedAt).getTime()).toBeGreaterThan(new Date(creee.updatedAt as string).getTime());
      expect(corps.__v).toBe(0);
      const relue = await (await lireEquipe(vide("GET", creee._id), ctx(creee._id))).json();
      expect(relue).toEqual(corps);
    });

    it("applique les valeurs par défaut du schéma quand les champs optionnels sont omis", async () => {
      const creee = await creer({ nom: "A", membres: ["x"], disponibilite: false });
      const res = await modifierEquipe(put(creee._id, { nom: "B" }), ctx(creee._id));
      expect(res.status).toBe(200);
      const corps = await res.json();
      expect(corps.membres).toEqual([]);
      expect(corps.disponibilite).toBe(true);
    });

    it("404 « Non trouvé » pour un identifiant inconnu", async () => {
      const res = await modifierEquipe(put(ID_INCONNU, { nom: "B" }), ctx(ID_INCONNU));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Non trouvé" });
    });

    it("400 « Identifiant invalide » avant la validation du corps", async () => {
      const res = await modifierEquipe(put("pas-un-id", { nom: "" }), ctx("pas-un-id"));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Identifiant invalide" });
    });

    it("400 avec le détail Zod quand le corps est invalide, sans modifier l'équipe", async () => {
      const creee = await creer();
      const res = await modifierEquipe(put(creee._id, { nom: "" }), ctx(creee._id));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: { formErrors: [], fieldErrors: { nom: ["Le nom est requis"] } },
      });
      const relue = await (await lireEquipe(vide("GET", creee._id), ctx(creee._id))).json();
      expect(relue.nom).toBe("Équipe A");
    });

    it("401 sans session, 403 chauffeur, 403 client, 403 lecture", async () => {
      const creee = await creer();
      session(null);
      expect((await modifierEquipe(put(creee._id, { nom: "B" }), ctx(creee._id))).status).toBe(401);
      session({ role: "chauffeur", equipeId: creee._id });
      expect((await modifierEquipe(put(creee._id, { nom: "B" }), ctx(creee._id))).status).toBe(403);
      session({ role: "client", clientId: ID_INCONNU });
      expect((await modifierEquipe(put(creee._id, { nom: "B" }), ctx(creee._id))).status).toBe(403);
      session({ role: "lecture" });
      const res = await modifierEquipe(put(creee._id, { nom: "B" }), ctx(creee._id));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Permission insuffisante" });
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await modifierEquipe(put(ID_INCONNU, { nom: "B" }), ctx(ID_INCONNU));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("MUST_CHANGE_PASSWORD");
    });
  });

  describe("DELETE /api/equipes/[id]", () => {
    it("200 { success: true } puis 404 à la relecture", async () => {
      const creee = await creer();
      const res = await supprimerEquipe(vide("DELETE", creee._id), ctx(creee._id));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect((await lireEquipe(vide("GET", creee._id), ctx(creee._id))).status).toBe(404);
    });

    it("404 « Non trouvé » pour un identifiant inconnu", async () => {
      const res = await supprimerEquipe(vide("DELETE", ID_INCONNU), ctx(ID_INCONNU));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Non trouvé" });
    });

    it("400 « Identifiant invalide » pour un identifiant mal formé", async () => {
      const res = await supprimerEquipe(vide("DELETE", "pas-un-id"), ctx("pas-un-id"));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Identifiant invalide" });
    });

    it("409 si un compte est rattaché, et l'équipe reste présente", async () => {
      const creee = await creer();
      await User.create({
        username: "ch_car", nom: "Ch", email: "ch_car@srh.ci", motDePasseHash: "x",
        role: "chauffeur", equipeId: creee._id,
      });
      const res = await supprimerEquipe(vide("DELETE", creee._id), ctx(creee._id));
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "Cette équipe est rattachée à des comptes utilisateurs" });
      expect((await lireEquipe(vide("GET", creee._id), ctx(creee._id))).status).toBe(200);
    });

    it("le rattachement (409) est contrôlé avant l'existence (404)", async () => {
      await User.create({
        username: "ch_fantome", nom: "Ch", email: "ch_fantome@srh.ci", motDePasseHash: "x",
        role: "chauffeur", equipeId: ID_INCONNU,
      });
      const res = await supprimerEquipe(vide("DELETE", ID_INCONNU), ctx(ID_INCONNU));
      expect(res.status).toBe(409);
    });

    it("401 sans session, 403 chauffeur, 403 client, 403 lecture ; l'équipe reste présente", async () => {
      const creee = await creer();
      session(null);
      expect((await supprimerEquipe(vide("DELETE", creee._id), ctx(creee._id))).status).toBe(401);
      session({ role: "chauffeur", equipeId: creee._id });
      expect((await supprimerEquipe(vide("DELETE", creee._id), ctx(creee._id))).status).toBe(403);
      session({ role: "client", clientId: ID_INCONNU });
      expect((await supprimerEquipe(vide("DELETE", creee._id), ctx(creee._id))).status).toBe(403);
      session({ role: "lecture" });
      expect((await supprimerEquipe(vide("DELETE", creee._id), ctx(creee._id))).status).toBe(403);
      asAdmin();
      expect((await lireEquipe(vide("GET", creee._id), ctx(creee._id))).status).toBe(200);
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await supprimerEquipe(vide("DELETE", ID_INCONNU), ctx(ID_INCONNU));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("MUST_CHANGE_PASSWORD");
    });
  });

  describe("corps JSON malformé (comportement actuel : la requête lève, sans réponse 400)", () => {
    const malforme = (method: string, url: string) =>
      new NextRequest(`http://localhost:3000${url}`, { method, body: "{ceci n'est pas du json" });

    it("POST : le gestionnaire rejette (req.json() n'est pas protégé) et rien n'est créé", async () => {
      await expect(creerEquipe(malforme("POST", "/api/equipes"))).rejects.toThrow();
      expect(await (await listerEquipes()).json()).toEqual([]);
    });

    it("PUT : le gestionnaire rejette et l'équipe reste inchangée", async () => {
      const creee = await creer({ nom: "Avant" });
      await expect(
        modifierEquipe(malforme("PUT", `/api/equipes/${creee._id}`), ctx(creee._id))
      ).rejects.toThrow();
      const res = await lireEquipe(vide("GET", creee._id), ctx(creee._id));
      expect(await res.json()).toEqual(creee);
    });
  });
});
