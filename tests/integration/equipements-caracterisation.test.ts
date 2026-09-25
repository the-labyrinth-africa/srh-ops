import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { GET as listerEquipements, POST as creerEquipement } from "@/app/api/equipements/route";
import { GET as lireEquipement, PUT as modifierEquipement, DELETE as supprimerEquipement } from "@/app/api/equipements/[id]/route";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Site } from "@/models/Site";
import { Operation } from "@/models/Operation";

/**
 * Caractérisation des 5 routes `/api/equipements` : ces tests figent le comportement HTTP
 * observable (statuts, corps JSON, messages, ordre des contrôles) avant la migration
 * hexagonale du domaine. Ils ne dépendent que des routes et des modèles.
 */

const ID_INCONNU = "507f1f77bcf86cd799439099";
const CLES_EQUIPEMENT = ["_id", "nom", "type", "disponibilite", "createdAt", "updatedAt", "__v"].sort();

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
const post = (body: unknown) => json("POST", "/api/equipements", body);
const put = (id: string, body: unknown) => json("PUT", `/api/equipements/${id}`, body);
const vide = (method: string, id: string) =>
  new NextRequest(`http://localhost:3000/api/equipements/${id}`, { method });

async function creer(body: unknown = { nom: "Pompe A", type: "Pompe", disponibilite: false }) {
  const res = await creerEquipement(post(body));
  expect(res.status).toBe(201);
  return (await res.json()) as Record<string, unknown> & { _id: string };
}

describe("equipements — caractérisation de l'API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    asAdmin();
  });

  describe("GET /api/equipements", () => {
    it("liste vide -> 200 et tableau vide", async () => {
      const res = await listerEquipements();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it("renvoie les équipements triés par nom croissant (ordre binaire), avec la forme JSON historique", async () => {
      await creer({ nom: "b-2" });
      await creer({ nom: "Z-9" });
      await creer({ nom: "A-1" });
      const res = await listerEquipements();
      expect(res.status).toBe(200);
      const liste = await res.json();
      expect(liste.map((e: { nom: string }) => e.nom)).toEqual(["A-1", "Z-9", "b-2"]);
      for (const e of liste) expect(Object.keys(e).sort()).toEqual(CLES_EQUIPEMENT);
    });

    it("renvoie les valeurs saisies (pas seulement les noms) et des dates/révisions cohérentes", async () => {
      await creer({ nom: "Z-9", type: "Benne", disponibilite: false });
      await creer({ nom: "A-1" });
      const liste = await (await listerEquipements()).json();
      expect(liste).toHaveLength(2);
      const [a, z] = liste;
      expect(a).toMatchObject({ nom: "A-1", type: "", disponibilite: true, __v: 0 });
      expect(z).toMatchObject({ nom: "Z-9", type: "Benne", disponibilite: false, __v: 0 });
      for (const e of liste) {
        expect(e._id).toMatch(/^[a-f\d]{24}$/);
        expect(new Date(e.createdAt).toISOString()).toBe(e.createdAt);
        expect(e.updatedAt).toBe(e.createdAt);
      }
      expect(a._id).not.toBe(z._id);
    });

    it("401 sans session", async () => {
      session(null);
      const res = await listerEquipements();
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Non authentifié" });
    });

    it("403 pour un chauffeur", async () => {
      session({ role: "chauffeur", equipeId: ID_INCONNU });
      const res = await listerEquipements();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Accès refusé" });
    });

    it("403 pour un client", async () => {
      session({ role: "client", clientId: ID_INCONNU });
      const res = await listerEquipements();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Accès refusé" });
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await listerEquipements();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: "Changement de mot de passe requis",
        code: "MUST_CHANGE_PASSWORD",
      });
    });

    it("un rôle lecture peut lister", async () => {
      session({ role: "lecture" });
      expect((await listerEquipements()).status).toBe(200);
    });
  });

  describe("POST /api/equipements", () => {
    it("201 avec l'ensemble exact des clés (_id, nom, type, disponibilite, createdAt, updatedAt, __v)", async () => {
      const res = await creerEquipement(post({ nom: "Compresseur", type: "Air", disponibilite: false }));
      expect(res.status).toBe(201);
      const corps = await res.json();
      expect(Object.keys(corps).sort()).toEqual(CLES_EQUIPEMENT);
      expect(corps._id).toMatch(/^[a-f\d]{24}$/);
      expect(corps.nom).toBe("Compresseur");
      expect(corps.type).toBe("Air");
      expect(corps.disponibilite).toBe(false);
      expect(corps.__v).toBe(0);
      expect(new Date(corps.createdAt).toISOString()).toBe(corps.createdAt);
      expect(corps.updatedAt).toBe(corps.createdAt);
    });

    it("applique les valeurs par défaut (type \"\", disponibilite true)", async () => {
      const corps = await creer({ nom: "SEUL" });
      expect(Object.keys(corps).sort()).toEqual(CLES_EQUIPEMENT);
      expect(corps.type).toBe("");
      expect(corps.disponibilite).toBe(true);
    });

    it("400 si le nom est vide, avec le détail Zod aplati", async () => {
      const res = await creerEquipement(post({ nom: "" }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: { formErrors: [], fieldErrors: { nom: ["Le nom est requis"] } },
      });
      expect(await (await listerEquipements()).json()).toEqual([]);
    });

    it("400 si le corps est invalide (types)", async () => {
      const res = await creerEquipement(post({ nom: 42, type: 7, disponibilite: "oui" }));
      expect(res.status).toBe(400);
      const corps = await res.json();
      expect(corps.error.formErrors).toEqual([]);
      expect(Object.keys(corps.error.fieldErrors).sort()).toEqual(["disponibilite", "nom", "type"]);
    });

    it("401 sans session", async () => {
      session(null);
      expect((await creerEquipement(post({ nom: "X" }))).status).toBe(401);
    });

    it("403 pour un chauffeur et pour un client", async () => {
      session({ role: "chauffeur", equipeId: ID_INCONNU });
      expect((await creerEquipement(post({ nom: "X" }))).status).toBe(403);
      session({ role: "client", clientId: ID_INCONNU });
      expect((await creerEquipement(post({ nom: "X" }))).status).toBe(403);
    });

    it("403 « Permission insuffisante » pour un rôle lecture (écriture refusée)", async () => {
      session({ role: "lecture" });
      const res = await creerEquipement(post({ nom: "X" }));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Permission insuffisante" });
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await creerEquipement(post({ nom: "X" }));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("MUST_CHANGE_PASSWORD");
    });

    it("le contrôle d'accès passe avant la validation du corps (403 même avec un corps invalide)", async () => {
      session({ role: "lecture" });
      expect((await creerEquipement(post({ nom: "" }))).status).toBe(403);
    });
  });

  describe("GET /api/equipements/[id]", () => {
    it("200 avec la forme JSON exacte", async () => {
      const cree = await creer();
      const res = await lireEquipement(vide("GET", cree._id), ctx(cree._id));
      expect(res.status).toBe(200);
      const corps = await res.json();
      expect(Object.keys(corps).sort()).toEqual(CLES_EQUIPEMENT);
      expect(corps).toEqual(cree);
    });

    it("404 « Non trouvé » pour un identifiant valide inconnu", async () => {
      const res = await lireEquipement(vide("GET", ID_INCONNU), ctx(ID_INCONNU));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Non trouvé" });
    });

    it("400 « Identifiant invalide » pour un identifiant mal formé", async () => {
      const res = await lireEquipement(vide("GET", "pas-un-id"), ctx("pas-un-id"));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Identifiant invalide" });
    });

    it("401 sans session, 403 chauffeur, 403 client", async () => {
      const cree = await creer();
      session(null);
      expect((await lireEquipement(vide("GET", cree._id), ctx(cree._id))).status).toBe(401);
      session({ role: "chauffeur", equipeId: ID_INCONNU });
      expect((await lireEquipement(vide("GET", cree._id), ctx(cree._id))).status).toBe(403);
      session({ role: "client", clientId: ID_INCONNU });
      expect((await lireEquipement(vide("GET", cree._id), ctx(cree._id))).status).toBe(403);
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await lireEquipement(vide("GET", ID_INCONNU), ctx(ID_INCONNU));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("MUST_CHANGE_PASSWORD");
    });

    it("l'authentification passe avant la garde d'identifiant (401 avec un id invalide)", async () => {
      session(null);
      expect((await lireEquipement(vide("GET", "x"), ctx("x"))).status).toBe(401);
    });
  });

  describe("PUT /api/equipements/[id]", () => {
    it("200 : remplace les champs, conserve _id/createdAt, avance updatedAt, __v inchangé", async () => {
      const cree = await creer();
      await new Promise((r) => setTimeout(r, 5));
      const res = await modifierEquipement(
        put(cree._id, { nom: "Pompe B", type: "Benne", disponibilite: true }),
        ctx(cree._id)
      );
      expect(res.status).toBe(200);
      const corps = await res.json();
      expect(Object.keys(corps).sort()).toEqual(CLES_EQUIPEMENT);
      expect(corps._id).toBe(cree._id);
      expect(corps.nom).toBe("Pompe B");
      expect(corps.type).toBe("Benne");
      expect(corps.disponibilite).toBe(true);
      expect(corps.createdAt).toBe(cree.createdAt);
      expect(new Date(corps.updatedAt).getTime()).toBeGreaterThan(new Date(cree.updatedAt as string).getTime());
      expect(corps.__v).toBe(0);
      const relu = await (await lireEquipement(vide("GET", cree._id), ctx(cree._id))).json();
      expect(relu).toEqual(corps);
    });

    it("applique les valeurs par défaut du schéma quand les champs optionnels sont omis", async () => {
      const cree = await creer({ nom: "A", type: "Pompe", disponibilite: false });
      const res = await modifierEquipement(put(cree._id, { nom: "B" }), ctx(cree._id));
      expect(res.status).toBe(200);
      const corps = await res.json();
      expect(corps.nom).toBe("B");
      expect(corps.type).toBe("");
      expect(corps.disponibilite).toBe(true);
    });

    it("404 « Non trouvé » pour un identifiant inconnu", async () => {
      const res = await modifierEquipement(put(ID_INCONNU, { nom: "B" }), ctx(ID_INCONNU));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Non trouvé" });
    });

    it("400 « Identifiant invalide » avant la validation du corps", async () => {
      const res = await modifierEquipement(put("pas-un-id", { nom: "" }), ctx("pas-un-id"));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Identifiant invalide" });
    });

    it("400 avec le détail Zod quand le corps est invalide, sans modifier l'équipement", async () => {
      const cree = await creer();
      const res = await modifierEquipement(put(cree._id, { nom: "" }), ctx(cree._id));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: { formErrors: [], fieldErrors: { nom: ["Le nom est requis"] } },
      });
      const relu = await (await lireEquipement(vide("GET", cree._id), ctx(cree._id))).json();
      expect(relu.nom).toBe("Pompe A");
    });

    it("401 sans session, 403 chauffeur, 403 client, 403 lecture", async () => {
      const cree = await creer();
      const corps = { nom: "B" };
      session(null);
      expect((await modifierEquipement(put(cree._id, corps), ctx(cree._id))).status).toBe(401);
      session({ role: "chauffeur", equipeId: ID_INCONNU });
      expect((await modifierEquipement(put(cree._id, corps), ctx(cree._id))).status).toBe(403);
      session({ role: "client", clientId: ID_INCONNU });
      expect((await modifierEquipement(put(cree._id, corps), ctx(cree._id))).status).toBe(403);
      session({ role: "lecture" });
      const res = await modifierEquipement(put(cree._id, corps), ctx(cree._id));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Permission insuffisante" });
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await modifierEquipement(put(ID_INCONNU, { nom: "B" }), ctx(ID_INCONNU));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("MUST_CHANGE_PASSWORD");
    });
  });

  describe("DELETE /api/equipements/[id]", () => {
    it("200 { success: true } puis 404 à la relecture", async () => {
      const cree = await creer();
      const res = await supprimerEquipement(vide("DELETE", cree._id), ctx(cree._id));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect((await lireEquipement(vide("GET", cree._id), ctx(cree._id))).status).toBe(404);
    });

    it("404 « Non trouvé » pour un identifiant inconnu", async () => {
      const res = await supprimerEquipement(vide("DELETE", ID_INCONNU), ctx(ID_INCONNU));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Non trouvé" });
    });

    it("400 « Identifiant invalide » pour un identifiant mal formé", async () => {
      const res = await supprimerEquipement(vide("DELETE", "pas-un-id"), ctx("pas-un-id"));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Identifiant invalide" });
    });

    it("aucun contrôle de rattachement : un équipement référencé par une opération (equipementIds) est supprimé (200)", async () => {
      const cree = await creer();
      const client = await Client.create({ nom: "Client Test" });
      const site = await Site.create({ clientId: client._id, nom: "Site Test" });
      const operation = await Operation.create({
        clientId: client._id,
        siteId: site._id,
        natureIntervention: "Intervention",
        dateHeurePrevue: new Date("2026-10-01T08:00:00Z"),
        dureeEstimeeMinutes: 60,
        equipementIds: [new mongoose.Types.ObjectId(cree._id)],
        statut: "Affectée",
      });
      const res = await supprimerEquipement(vide("DELETE", cree._id), ctx(cree._id));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect((await lireEquipement(vide("GET", cree._id), ctx(cree._id))).status).toBe(404);
      const relue = (await Operation.findById(operation._id).lean()) as { equipementIds?: unknown[] } | null;
      expect((relue?.equipementIds ?? []).map(String)).toEqual([cree._id]);
    });

    it("401 sans session, 403 chauffeur, 403 client, 403 lecture ; l'équipement reste présent", async () => {
      const cree = await creer();
      session(null);
      expect((await supprimerEquipement(vide("DELETE", cree._id), ctx(cree._id))).status).toBe(401);
      session({ role: "chauffeur", equipeId: ID_INCONNU });
      expect((await supprimerEquipement(vide("DELETE", cree._id), ctx(cree._id))).status).toBe(403);
      session({ role: "client", clientId: ID_INCONNU });
      expect((await supprimerEquipement(vide("DELETE", cree._id), ctx(cree._id))).status).toBe(403);
      session({ role: "lecture" });
      expect((await supprimerEquipement(vide("DELETE", cree._id), ctx(cree._id))).status).toBe(403);
      asAdmin();
      expect((await lireEquipement(vide("GET", cree._id), ctx(cree._id))).status).toBe(200);
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await supprimerEquipement(vide("DELETE", ID_INCONNU), ctx(ID_INCONNU));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("MUST_CHANGE_PASSWORD");
    });
  });

  describe("corps JSON malformé (comportement actuel : la requête lève, sans réponse 400)", () => {
    const malforme = (method: string, url: string) =>
      new NextRequest(`http://localhost:3000${url}`, { method, body: "{ceci n'est pas du json" });

    it("POST : le gestionnaire rejette (req.json() n'est pas protégé) et rien n'est créé", async () => {
      await expect(creerEquipement(malforme("POST", "/api/equipements"))).rejects.toThrow();
      expect(await (await listerEquipements()).json()).toEqual([]);
    });

    it("PUT : le gestionnaire rejette et l'équipement reste inchangé", async () => {
      const cree = await creer({ nom: "AVANT" });
      await expect(
        modifierEquipement(malforme("PUT", `/api/equipements/${cree._id}`), ctx(cree._id))
      ).rejects.toThrow();
      const res = await lireEquipement(vide("GET", cree._id), ctx(cree._id));
      expect(await res.json()).toEqual(cree);
    });
  });
});
