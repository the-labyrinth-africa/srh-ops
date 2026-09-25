import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { GET as listerVehicules, POST as creerVehicule } from "@/app/api/vehicules/route";
import { GET as lireVehicule, PUT as modifierVehicule, DELETE as supprimerVehicule } from "@/app/api/vehicules/[id]/route";
import { Vehicule } from "@/backend/vehicules/infrastructure/mongoose/vehicule.model";
import { Client } from "@/models/Client";
import { Site } from "@/models/Site";
import { Operation } from "@/models/Operation";

/**
 * Caractérisation des 5 routes `/api/vehicules` : ces tests figent le comportement HTTP
 * observable (statuts, corps JSON, messages, ordre des contrôles) avant la migration
 * hexagonale du domaine. Ils ne dépendent que des routes et des modèles.
 */

const ID_INCONNU = "507f1f77bcf86cd799439099";
const CLES_VEHICULE = ["_id", "identification", "type", "capacite", "disponibilite", "createdAt", "updatedAt", "__v"].sort();

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
const post = (body: unknown) => json("POST", "/api/vehicules", body);
const put = (id: string, body: unknown) => json("PUT", `/api/vehicules/${id}`, body);
const vide = (method: string, id: string) =>
  new NextRequest(`http://localhost:3000/api/vehicules/${id}`, { method });

async function creer(body: unknown = { identification: "1234-AB-01", type: "Citerne", capacite: 5000, disponibilite: false }) {
  const res = await creerVehicule(post(body));
  expect(res.status).toBe(201);
  return (await res.json()) as Record<string, unknown> & { _id: string };
}

describe("vehicules — caractérisation de l'API", () => {
  beforeAll(async () => {
    // L'index unique de l'immatriculation doit exister avant les tests de doublon.
    await Vehicule.init();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    asAdmin();
  });

  describe("GET /api/vehicules", () => {
    it("liste vide -> 200 et tableau vide", async () => {
      const res = await listerVehicules();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it("renvoie les véhicules triés par immatriculation croissante (ordre binaire), avec la forme JSON historique", async () => {
      await creer({ identification: "b-2" });
      await creer({ identification: "Z-9" });
      await creer({ identification: "A-1" });
      const res = await listerVehicules();
      expect(res.status).toBe(200);
      const liste = await res.json();
      expect(liste.map((v: { identification: string }) => v.identification)).toEqual(["A-1", "Z-9", "b-2"]);
      for (const v of liste) expect(Object.keys(v).sort()).toEqual(CLES_VEHICULE);
    });

    it("renvoie les valeurs saisies (pas seulement les noms) et des dates/révisions cohérentes", async () => {
      await creer({ identification: "Z-9", type: "Benne", capacite: 12, disponibilite: false });
      await creer({ identification: "A-1" });
      const liste = await (await listerVehicules()).json();
      expect(liste).toHaveLength(2);
      const [a, z] = liste;
      expect(a).toMatchObject({ identification: "A-1", type: "", capacite: 0, disponibilite: true, __v: 0 });
      expect(z).toMatchObject({ identification: "Z-9", type: "Benne", capacite: 12, disponibilite: false, __v: 0 });
      for (const v of liste) {
        expect(v._id).toMatch(/^[a-f\d]{24}$/);
        expect(new Date(v.createdAt).toISOString()).toBe(v.createdAt);
        expect(v.updatedAt).toBe(v.createdAt);
      }
      expect(a._id).not.toBe(z._id);
    });

    it("401 sans session", async () => {
      session(null);
      const res = await listerVehicules();
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Non authentifié" });
    });

    it("403 pour un chauffeur", async () => {
      session({ role: "chauffeur", equipeId: ID_INCONNU });
      const res = await listerVehicules();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Accès refusé" });
    });

    it("403 pour un client", async () => {
      session({ role: "client", clientId: ID_INCONNU });
      const res = await listerVehicules();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Accès refusé" });
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await listerVehicules();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: "Changement de mot de passe requis",
        code: "MUST_CHANGE_PASSWORD",
      });
    });

    it("un rôle lecture peut lister", async () => {
      session({ role: "lecture" });
      expect((await listerVehicules()).status).toBe(200);
    });
  });

  describe("POST /api/vehicules", () => {
    it("201 avec l'ensemble exact des clés (_id, identification, type, capacite, disponibilite, createdAt, updatedAt, __v)", async () => {
      const res = await creerVehicule(
        post({ identification: "5678-CD-02", type: "Camion-citerne", capacite: 8000, disponibilite: false })
      );
      expect(res.status).toBe(201);
      const corps = await res.json();
      expect(Object.keys(corps).sort()).toEqual(CLES_VEHICULE);
      expect(corps._id).toMatch(/^[a-f\d]{24}$/);
      expect(corps.identification).toBe("5678-CD-02");
      expect(corps.type).toBe("Camion-citerne");
      expect(corps.capacite).toBe(8000);
      expect(corps.disponibilite).toBe(false);
      expect(corps.__v).toBe(0);
      expect(new Date(corps.createdAt).toISOString()).toBe(corps.createdAt);
      expect(corps.updatedAt).toBe(corps.createdAt);
    });

    it("applique les valeurs par défaut (type \"\", capacite 0, disponibilite true)", async () => {
      const corps = await creer({ identification: "SEUL" });
      expect(Object.keys(corps).sort()).toEqual(CLES_VEHICULE);
      expect(corps.type).toBe("");
      expect(corps.capacite).toBe(0);
      expect(corps.disponibilite).toBe(true);
    });

    it("convertit une capacité fournie en chaîne en nombre (coercition Zod)", async () => {
      const corps = await creer({ identification: "COERCE", capacite: "12" });
      expect(corps.capacite).toBe(12);
      expect(typeof corps.capacite).toBe("number");
    });

    it("400 si l'immatriculation est vide, avec le détail Zod aplati", async () => {
      const res = await creerVehicule(post({ identification: "" }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: { formErrors: [], fieldErrors: { identification: ["Immatriculation requise"] } },
      });
      expect(await (await listerVehicules()).json()).toEqual([]);
    });

    it("400 si la capacité est négative", async () => {
      const res = await creerVehicule(post({ identification: "X", capacite: -1 }));
      expect(res.status).toBe(400);
      const corps = await res.json();
      expect(corps.error.formErrors).toEqual([]);
      expect(Object.keys(corps.error.fieldErrors)).toEqual(["capacite"]);
      expect(corps.error.fieldErrors.capacite).toHaveLength(1);
    });

    it("400 si le corps est invalide (types)", async () => {
      const res = await creerVehicule(post({ identification: 42, type: 7, disponibilite: "oui" }));
      expect(res.status).toBe(400);
      const corps = await res.json();
      expect(corps.error.formErrors).toEqual([]);
      expect(Object.keys(corps.error.fieldErrors).sort()).toEqual(["disponibilite", "identification", "type"]);
    });

    it("le second POST avec la même immatriculation lève une erreur (index unique, non interceptée)", async () => {
      await creer({ identification: "DOUBLON" });
      await expect(creerVehicule(post({ identification: "DOUBLON" }))).rejects.toThrow();
      expect(await (await listerVehicules()).json()).toHaveLength(1);
    });

    it("401 sans session", async () => {
      session(null);
      expect((await creerVehicule(post({ identification: "X" }))).status).toBe(401);
    });

    it("403 pour un chauffeur et pour un client", async () => {
      session({ role: "chauffeur", equipeId: ID_INCONNU });
      expect((await creerVehicule(post({ identification: "X" }))).status).toBe(403);
      session({ role: "client", clientId: ID_INCONNU });
      expect((await creerVehicule(post({ identification: "X" }))).status).toBe(403);
    });

    it("403 « Permission insuffisante » pour un rôle lecture (écriture refusée)", async () => {
      session({ role: "lecture" });
      const res = await creerVehicule(post({ identification: "X" }));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Permission insuffisante" });
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await creerVehicule(post({ identification: "X" }));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("MUST_CHANGE_PASSWORD");
    });

    it("le contrôle d'accès passe avant la validation du corps (403 même avec un corps invalide)", async () => {
      session({ role: "lecture" });
      expect((await creerVehicule(post({ identification: "" }))).status).toBe(403);
    });
  });

  describe("GET /api/vehicules/[id]", () => {
    it("200 avec la forme JSON exacte", async () => {
      const cree = await creer();
      const res = await lireVehicule(vide("GET", cree._id), ctx(cree._id));
      expect(res.status).toBe(200);
      const corps = await res.json();
      expect(Object.keys(corps).sort()).toEqual(CLES_VEHICULE);
      expect(corps).toEqual(cree);
    });

    it("404 « Non trouvé » pour un identifiant valide inconnu", async () => {
      const res = await lireVehicule(vide("GET", ID_INCONNU), ctx(ID_INCONNU));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Non trouvé" });
    });

    it("400 « Identifiant invalide » pour un identifiant mal formé", async () => {
      const res = await lireVehicule(vide("GET", "pas-un-id"), ctx("pas-un-id"));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Identifiant invalide" });
    });

    it("401 sans session, 403 chauffeur, 403 client", async () => {
      const cree = await creer();
      session(null);
      expect((await lireVehicule(vide("GET", cree._id), ctx(cree._id))).status).toBe(401);
      session({ role: "chauffeur", equipeId: ID_INCONNU });
      expect((await lireVehicule(vide("GET", cree._id), ctx(cree._id))).status).toBe(403);
      session({ role: "client", clientId: ID_INCONNU });
      expect((await lireVehicule(vide("GET", cree._id), ctx(cree._id))).status).toBe(403);
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await lireVehicule(vide("GET", ID_INCONNU), ctx(ID_INCONNU));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("MUST_CHANGE_PASSWORD");
    });

    it("l'authentification passe avant la garde d'identifiant (401 avec un id invalide)", async () => {
      session(null);
      expect((await lireVehicule(vide("GET", "x"), ctx("x"))).status).toBe(401);
    });
  });

  describe("PUT /api/vehicules/[id]", () => {
    it("200 : remplace les champs, conserve _id/createdAt, avance updatedAt, __v inchangé", async () => {
      const cree = await creer();
      await new Promise((r) => setTimeout(r, 5));
      const res = await modifierVehicule(
        put(cree._id, { identification: "9999-ZZ-09", type: "Benne", capacite: "300", disponibilite: true }),
        ctx(cree._id)
      );
      expect(res.status).toBe(200);
      const corps = await res.json();
      expect(Object.keys(corps).sort()).toEqual(CLES_VEHICULE);
      expect(corps._id).toBe(cree._id);
      expect(corps.identification).toBe("9999-ZZ-09");
      expect(corps.type).toBe("Benne");
      expect(corps.capacite).toBe(300);
      expect(corps.disponibilite).toBe(true);
      expect(corps.createdAt).toBe(cree.createdAt);
      expect(new Date(corps.updatedAt).getTime()).toBeGreaterThan(new Date(cree.updatedAt as string).getTime());
      expect(corps.__v).toBe(0);
      const relu = await (await lireVehicule(vide("GET", cree._id), ctx(cree._id))).json();
      expect(relu).toEqual(corps);
    });

    it("applique les valeurs par défaut du schéma quand les champs optionnels sont omis", async () => {
      const cree = await creer({ identification: "A", type: "Citerne", capacite: 5000, disponibilite: false });
      const res = await modifierVehicule(put(cree._id, { identification: "B" }), ctx(cree._id));
      expect(res.status).toBe(200);
      const corps = await res.json();
      expect(corps.identification).toBe("B");
      expect(corps.type).toBe("");
      expect(corps.capacite).toBe(0);
      expect(corps.disponibilite).toBe(true);
    });

    it("404 « Non trouvé » pour un identifiant inconnu", async () => {
      const res = await modifierVehicule(put(ID_INCONNU, { identification: "B" }), ctx(ID_INCONNU));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Non trouvé" });
    });

    it("400 « Identifiant invalide » avant la validation du corps", async () => {
      const res = await modifierVehicule(put("pas-un-id", { identification: "" }), ctx("pas-un-id"));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Identifiant invalide" });
    });

    it("400 avec le détail Zod quand le corps est invalide, sans modifier le véhicule", async () => {
      const cree = await creer();
      const res = await modifierVehicule(put(cree._id, { identification: "" }), ctx(cree._id));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: { formErrors: [], fieldErrors: { identification: ["Immatriculation requise"] } },
      });
      const relu = await (await lireVehicule(vide("GET", cree._id), ctx(cree._id))).json();
      expect(relu.identification).toBe("1234-AB-01");
    });

    it("401 sans session, 403 chauffeur, 403 client, 403 lecture", async () => {
      const cree = await creer();
      const corps = { identification: "B" };
      session(null);
      expect((await modifierVehicule(put(cree._id, corps), ctx(cree._id))).status).toBe(401);
      session({ role: "chauffeur", equipeId: ID_INCONNU });
      expect((await modifierVehicule(put(cree._id, corps), ctx(cree._id))).status).toBe(403);
      session({ role: "client", clientId: ID_INCONNU });
      expect((await modifierVehicule(put(cree._id, corps), ctx(cree._id))).status).toBe(403);
      session({ role: "lecture" });
      const res = await modifierVehicule(put(cree._id, corps), ctx(cree._id));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Permission insuffisante" });
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await modifierVehicule(put(ID_INCONNU, { identification: "B" }), ctx(ID_INCONNU));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("MUST_CHANGE_PASSWORD");
    });
  });

  describe("DELETE /api/vehicules/[id]", () => {
    it("200 { success: true } puis 404 à la relecture", async () => {
      const cree = await creer();
      const res = await supprimerVehicule(vide("DELETE", cree._id), ctx(cree._id));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect((await lireVehicule(vide("GET", cree._id), ctx(cree._id))).status).toBe(404);
    });

    it("404 « Non trouvé » pour un identifiant inconnu", async () => {
      const res = await supprimerVehicule(vide("DELETE", ID_INCONNU), ctx(ID_INCONNU));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Non trouvé" });
    });

    it("400 « Identifiant invalide » pour un identifiant mal formé", async () => {
      const res = await supprimerVehicule(vide("DELETE", "pas-un-id"), ctx("pas-un-id"));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Identifiant invalide" });
    });

    it("aucun contrôle de rattachement : un véhicule référencé par une opération est supprimé (200)", async () => {
      const cree = await creer();
      const client = await Client.create({ nom: "Client Test" });
      const site = await Site.create({ clientId: client._id, nom: "Site Test" });
      const operation = await Operation.create({
        clientId: client._id,
        siteId: site._id,
        natureIntervention: "Intervention",
        dateHeurePrevue: new Date("2026-10-01T08:00:00Z"),
        dureeEstimeeMinutes: 60,
        vehiculeId: new mongoose.Types.ObjectId(cree._id),
        statut: "Affectée",
      });
      const res = await supprimerVehicule(vide("DELETE", cree._id), ctx(cree._id));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect((await lireVehicule(vide("GET", cree._id), ctx(cree._id))).status).toBe(404);
      const relue = (await Operation.findById(operation._id).lean()) as { vehiculeId?: unknown } | null;
      expect(String(relue?.vehiculeId)).toBe(cree._id);
    });

    it("401 sans session, 403 chauffeur, 403 client, 403 lecture ; le véhicule reste présent", async () => {
      const cree = await creer();
      session(null);
      expect((await supprimerVehicule(vide("DELETE", cree._id), ctx(cree._id))).status).toBe(401);
      session({ role: "chauffeur", equipeId: ID_INCONNU });
      expect((await supprimerVehicule(vide("DELETE", cree._id), ctx(cree._id))).status).toBe(403);
      session({ role: "client", clientId: ID_INCONNU });
      expect((await supprimerVehicule(vide("DELETE", cree._id), ctx(cree._id))).status).toBe(403);
      session({ role: "lecture" });
      expect((await supprimerVehicule(vide("DELETE", cree._id), ctx(cree._id))).status).toBe(403);
      asAdmin();
      expect((await lireVehicule(vide("GET", cree._id), ctx(cree._id))).status).toBe(200);
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await supprimerVehicule(vide("DELETE", ID_INCONNU), ctx(ID_INCONNU));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("MUST_CHANGE_PASSWORD");
    });
  });

  describe("corps JSON malformé (comportement actuel : la requête lève, sans réponse 400)", () => {
    const malforme = (method: string, url: string) =>
      new NextRequest(`http://localhost:3000${url}`, { method, body: "{ceci n'est pas du json" });

    it("POST : le gestionnaire rejette (req.json() n'est pas protégé) et rien n'est créé", async () => {
      await expect(creerVehicule(malforme("POST", "/api/vehicules"))).rejects.toThrow();
      expect(await (await listerVehicules()).json()).toEqual([]);
    });

    it("PUT : le gestionnaire rejette et le véhicule reste inchangé", async () => {
      const cree = await creer({ identification: "AVANT" });
      await expect(
        modifierVehicule(malforme("PUT", `/api/vehicules/${cree._id}`), ctx(cree._id))
      ).rejects.toThrow();
      const res = await lireVehicule(vide("GET", cree._id), ctx(cree._id));
      expect(await res.json()).toEqual(cree);
    });
  });
});
