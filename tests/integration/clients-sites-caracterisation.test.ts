import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { GET as listerClients, POST as creerClient } from "@/app/api/clients/route";
import { GET as lireClient, PUT as modifierClient, DELETE as supprimerClient } from "@/app/api/clients/[id]/route";
import { Site } from "@/models/Site";
import { User } from "@/models/User";

/**
 * Caractérisation des routes `/api/clients` (entité `Client` du domaine `clients-sites`) :
 * ces tests figent le comportement HTTP observable (statuts, corps JSON, messages, ordre des
 * contrôles) avant la migration hexagonale du domaine. Ils ne dépendent que des routes et des
 * modèles. La couverture d'autorisation déjà assurée ailleurs n'est pas dupliquée ici :
 * - `tests/integration/chauffeur-scope.test.ts` couvre le refus (403) d'un chauffeur en lecture
 *   (avec ou sans équipe) et le périmètre d'un compte `client` (liste filtrée, 404 hors périmètre).
 * - `tests/integration/authz-roles.test.ts` couvre également l'isolation du rôle `client`.
 * - `tests/integration/referentiels-delete-guard.test.ts` couvre le 409 de suppression d'un
 *   client rattaché à un compte utilisateur ; seule sa persistance après migration est requise,
 *   pas sa duplication ici.
 *
 * Les routes `sites` sont ajoutées à la tâche 2 dans ce même fichier.
 */

const ID_INCONNU = "507f1f77bcf86cd799439099";
const CLES_CLIENT = ["_id", "nom", "contact", "createdAt", "updatedAt", "__v"].sort();

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
const post = (body: unknown) => json("POST", "/api/clients", body);
const put = (id: string, body: unknown) => json("PUT", `/api/clients/${id}`, body);
const vide = (method: string, id: string) =>
  new NextRequest(`http://localhost:3000/api/clients/${id}`, { method });

async function creer(body: unknown = { nom: "Alpha", contact: { telephone: "0102030405", email: "a@srh.ci" } }) {
  const res = await creerClient(post(body));
  expect(res.status).toBe(201);
  return (await res.json()) as Record<string, unknown> & { _id: string };
}

describe("clients-sites — caractérisation de l'API clients", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    asAdmin();
  });

  describe("GET /api/clients", () => {
    it("liste vide -> 200 et tableau vide", async () => {
      const res = await listerClients();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it("renvoie les clients triés par nom croissant (ordre binaire), avec les valeurs (pas seulement les clés)", async () => {
      await creer({ nom: "Beta", contact: { telephone: "1", email: "b@srh.ci" } });
      await creer({ nom: "alpha", contact: { telephone: "2", email: "a@srh.ci" } });
      await creer({ nom: "Alpha", contact: { telephone: "3", email: "a2@srh.ci" } });
      const res = await listerClients();
      expect(res.status).toBe(200);
      const liste = await res.json();
      expect(liste.map((c: { nom: string }) => c.nom)).toEqual(["Alpha", "Beta", "alpha"]);
      for (const c of liste) expect(Object.keys(c).sort()).toEqual(CLES_CLIENT);
      expect(liste[0].contact).toEqual({ telephone: "3", email: "a2@srh.ci" });
    });

    it("applique les valeurs par défaut du contact (telephone et email vides)", async () => {
      const corps = await creer({ nom: "Sans contact", contact: {} });
      expect(corps.contact).toEqual({ telephone: "", email: "" });
      const liste = await (await listerClients()).json();
      expect(liste[0].contact).toEqual({ telephone: "", email: "" });
    });

    it("401 sans session", async () => {
      session(null);
      const res = await listerClients();
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Non authentifié" });
    });

    it("403 pour un chauffeur (aucun accès, y compris en lecture)", async () => {
      session({ role: "chauffeur", equipeId: ID_INCONNU });
      const res = await listerClients();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Accès refusé" });
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await listerClients();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: "Changement de mot de passe requis",
        code: "MUST_CHANGE_PASSWORD",
      });
    });

    it("un rôle lecture peut lister", async () => {
      session({ role: "lecture" });
      expect((await listerClients()).status).toBe(200);
    });
  });

  describe("POST /api/clients", () => {
    it("201 avec l'ensemble exact des clés (_id, nom, contact, createdAt, updatedAt, __v)", async () => {
      const res = await creerClient(post({ nom: "Client Test", contact: { telephone: "0102030405", email: "c@srh.ci" } }));
      expect(res.status).toBe(201);
      const corps = await res.json();
      expect(Object.keys(corps).sort()).toEqual(CLES_CLIENT);
      expect(corps._id).toMatch(/^[a-f\d]{24}$/);
      expect(corps.nom).toBe("Client Test");
      expect(corps.contact).toEqual({ telephone: "0102030405", email: "c@srh.ci" });
      expect(corps.__v).toBe(0);
      expect(new Date(corps.createdAt).toISOString()).toBe(corps.createdAt);
      expect(corps.updatedAt).toBe(corps.createdAt);
    });

    it("applique les valeurs par défaut du contact (telephone et email \"\") quand `contact` est vide", async () => {
      const corps = await creer({ nom: "Seul", contact: {} });
      expect(Object.keys(corps).sort()).toEqual(CLES_CLIENT);
      expect(corps.contact).toEqual({ telephone: "", email: "" });
    });

    it("400 quand `contact` est omis (requis par le schéma)", async () => {
      const res = await creerClient(post({ nom: "Sans contact" }));
      expect(res.status).toBe(400);
      expect((await res.json()).error.fieldErrors).toHaveProperty("contact");
    });

    it("400 si le nom est vide, avec le détail Zod aplati", async () => {
      const res = await creerClient(post({ nom: "", contact: {} }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: { formErrors: [], fieldErrors: { nom: ["Le nom est requis"] } },
      });
      expect(await (await listerClients()).json()).toEqual([]);
    });

    it("400 si contact.email est invalide", async () => {
      const res = await creerClient(post({ nom: "X", contact: { email: "pas-un-email" } }));
      expect(res.status).toBe(400);
      const corps = await res.json();
      expect(corps.error.formErrors).toEqual([]);
      expect(Object.keys(corps.error.fieldErrors)).toEqual(["contact"]);
    });

    it("400 si le corps a des types invalides", async () => {
      const res = await creerClient(post({ nom: 42, contact: "pas-un-objet" }));
      expect(res.status).toBe(400);
      const corps = await res.json();
      expect(corps.error.formErrors).toEqual([]);
      expect(Object.keys(corps.error.fieldErrors).sort()).toEqual(["contact", "nom"]);
    });

    it("401 sans session", async () => {
      session(null);
      expect((await creerClient(post({ nom: "X" }))).status).toBe(401);
    });

    it("403 pour un chauffeur", async () => {
      session({ role: "chauffeur", equipeId: ID_INCONNU });
      expect((await creerClient(post({ nom: "X" }))).status).toBe(403);
    });

    it("403 « Permission insuffisante » pour un rôle lecture (écriture refusée)", async () => {
      session({ role: "lecture" });
      const res = await creerClient(post({ nom: "X" }));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Permission insuffisante" });
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await creerClient(post({ nom: "X" }));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("MUST_CHANGE_PASSWORD");
    });

    it("corps JSON malformé : le gestionnaire rejette et rien n'est créé", async () => {
      const malforme = new NextRequest("http://localhost:3000/api/clients", {
        method: "POST",
        body: "{ceci n'est pas du json",
      });
      await expect(creerClient(malforme)).rejects.toThrow();
      expect(await (await listerClients()).json()).toEqual([]);
    });
  });

  describe("GET /api/clients/[id]", () => {
    it("200 avec la forme JSON exacte", async () => {
      const cree = await creer();
      const res = await lireClient(vide("GET", cree._id), ctx(cree._id));
      expect(res.status).toBe(200);
      const corps = await res.json();
      expect(Object.keys(corps).sort()).toEqual(CLES_CLIENT);
      expect(corps).toEqual(cree);
    });

    it("404 « Non trouvé » pour un identifiant valide inconnu", async () => {
      const res = await lireClient(vide("GET", ID_INCONNU), ctx(ID_INCONNU));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Non trouvé" });
    });

    it("400 « Identifiant invalide » pour un identifiant mal formé", async () => {
      const res = await lireClient(vide("GET", "pas-un-id"), ctx("pas-un-id"));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Identifiant invalide" });
    });

    it("404 « Non trouvé » (et non 403) pour un compte client hors de son périmètre", async () => {
      const cree = await creer();
      session({ role: "client", clientId: ID_INCONNU });
      const res = await lireClient(vide("GET", cree._id), ctx(cree._id));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Non trouvé" });
    });

    it("401 sans session, 403 chauffeur", async () => {
      const cree = await creer();
      session(null);
      expect((await lireClient(vide("GET", cree._id), ctx(cree._id))).status).toBe(401);
      session({ role: "chauffeur", equipeId: ID_INCONNU });
      expect((await lireClient(vide("GET", cree._id), ctx(cree._id))).status).toBe(403);
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await lireClient(vide("GET", ID_INCONNU), ctx(ID_INCONNU));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("MUST_CHANGE_PASSWORD");
    });

    it("l'authentification passe avant la garde d'identifiant (401 avec un id invalide)", async () => {
      session(null);
      expect((await lireClient(vide("GET", "x"), ctx("x"))).status).toBe(401);
    });
  });

  describe("PUT /api/clients/[id]", () => {
    it("200 : remplace les champs, conserve _id/createdAt, avance updatedAt, __v inchangé", async () => {
      const cree = await creer();
      await new Promise((r) => setTimeout(r, 5));
      const res = await modifierClient(
        put(cree._id, { nom: "Alpha modifié", contact: { telephone: "9", email: "m@srh.ci" } }),
        ctx(cree._id)
      );
      expect(res.status).toBe(200);
      const corps = await res.json();
      expect(Object.keys(corps).sort()).toEqual(CLES_CLIENT);
      expect(corps._id).toBe(cree._id);
      expect(corps.nom).toBe("Alpha modifié");
      expect(corps.contact).toEqual({ telephone: "9", email: "m@srh.ci" });
      expect(corps.createdAt).toBe(cree.createdAt);
      expect(new Date(corps.updatedAt).getTime()).toBeGreaterThan(new Date(cree.updatedAt as string).getTime());
      expect(corps.__v).toBe(0);
      const relu = await (await lireClient(vide("GET", cree._id), ctx(cree._id))).json();
      expect(relu).toEqual(corps);
    });

    it("applique le défaut Zod de contact.telephone (\"\") quand seul ce sous-champ est omis", async () => {
      const cree = await creer({ nom: "A", contact: { telephone: "1", email: "a@srh.ci" } });
      const res = await modifierClient(put(cree._id, { nom: "B", contact: {} }), ctx(cree._id));
      expect(res.status).toBe(200);
      const corps = await res.json();
      expect(corps.nom).toBe("B");
      expect(corps.contact.telephone).toBe("");
    });

    it("400 quand `contact` est omis (requis par le schéma, sans valeur par défaut au niveau racine)", async () => {
      const cree = await creer();
      const res = await modifierClient(put(cree._id, { nom: "B" }), ctx(cree._id));
      expect(res.status).toBe(400);
      expect((await res.json()).error.fieldErrors).toHaveProperty("contact");
    });

    it("404 « Non trouvé » pour un identifiant inconnu", async () => {
      const res = await modifierClient(put(ID_INCONNU, { nom: "B", contact: {} }), ctx(ID_INCONNU));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Non trouvé" });
    });

    it("400 « Identifiant invalide » avant la validation du corps", async () => {
      const res = await modifierClient(put("pas-un-id", { nom: "" }), ctx("pas-un-id"));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Identifiant invalide" });
    });

    it("400 avec le détail Zod quand le corps est invalide, sans modifier le client", async () => {
      const cree = await creer();
      const res = await modifierClient(put(cree._id, { nom: "", contact: {} }), ctx(cree._id));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: { formErrors: [], fieldErrors: { nom: ["Le nom est requis"] } },
      });
      const relu = await (await lireClient(vide("GET", cree._id), ctx(cree._id))).json();
      expect(relu.nom).toBe("Alpha");
    });

    it("401 sans session, 403 chauffeur, 403 lecture", async () => {
      const cree = await creer();
      const corps = { nom: "B", contact: {} };
      session(null);
      expect((await modifierClient(put(cree._id, corps), ctx(cree._id))).status).toBe(401);
      session({ role: "chauffeur", equipeId: ID_INCONNU });
      expect((await modifierClient(put(cree._id, corps), ctx(cree._id))).status).toBe(403);
      session({ role: "lecture" });
      const res = await modifierClient(put(cree._id, corps), ctx(cree._id));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Permission insuffisante" });
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await modifierClient(put(ID_INCONNU, { nom: "B", contact: {} }), ctx(ID_INCONNU));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("MUST_CHANGE_PASSWORD");
    });

    it("corps JSON malformé : le gestionnaire rejette et le client reste inchangé", async () => {
      const cree = await creer({ nom: "Avant", contact: { telephone: "", email: "" } });
      const malforme = new NextRequest(`http://localhost:3000/api/clients/${cree._id}`, {
        method: "PUT",
        body: "{ceci n'est pas du json",
      });
      await expect(modifierClient(malforme, ctx(cree._id))).rejects.toThrow();
      const res = await lireClient(vide("GET", cree._id), ctx(cree._id));
      expect(await res.json()).toEqual(cree);
    });
  });

  describe("DELETE /api/clients/[id]", () => {
    // Le 409 « client rattaché à un compte utilisateur » est déjà couvert par
    // tests/integration/referentiels-delete-guard.test.ts : non dupliqué ici.

    it("200 { success: true } d'un client libre, puis 404 à la relecture", async () => {
      const cree = await creer();
      const res = await supprimerClient(vide("DELETE", cree._id), ctx(cree._id));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect((await lireClient(vide("GET", cree._id), ctx(cree._id))).status).toBe(404);
    });

    it("200 pour un client ayant des sites mais aucun compte rattaché : le client disparaît, les sites restent (comportement actuel)", async () => {
      const cree = await creer();
      const site = await Site.create({ clientId: cree._id, nom: "Site orphelin" });
      expect(await User.exists({ clientId: cree._id })).toBeNull();

      const res = await supprimerClient(vide("DELETE", cree._id), ctx(cree._id));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect((await lireClient(vide("GET", cree._id), ctx(cree._id))).status).toBe(404);

      const siteRelu = (await Site.findById(site._id).lean()) as { clientId: unknown } | null;
      expect(siteRelu).not.toBeNull();
      expect(String(siteRelu?.clientId)).toBe(cree._id);
    });

    it("404 « Non trouvé » pour un identifiant inconnu", async () => {
      const res = await supprimerClient(vide("DELETE", ID_INCONNU), ctx(ID_INCONNU));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Non trouvé" });
    });

    it("400 « Identifiant invalide » pour un identifiant mal formé", async () => {
      const res = await supprimerClient(vide("DELETE", "pas-un-id"), ctx("pas-un-id"));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Identifiant invalide" });
    });

    it("401 sans session, 403 chauffeur, 403 lecture ; le client reste présent", async () => {
      const cree = await creer();
      session(null);
      expect((await supprimerClient(vide("DELETE", cree._id), ctx(cree._id))).status).toBe(401);
      session({ role: "chauffeur", equipeId: ID_INCONNU });
      expect((await supprimerClient(vide("DELETE", cree._id), ctx(cree._id))).status).toBe(403);
      session({ role: "lecture" });
      expect((await supprimerClient(vide("DELETE", cree._id), ctx(cree._id))).status).toBe(403);
      asAdmin();
      expect((await lireClient(vide("GET", cree._id), ctx(cree._id))).status).toBe(200);
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await supprimerClient(vide("DELETE", ID_INCONNU), ctx(ID_INCONNU));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("MUST_CHANGE_PASSWORD");
    });
  });
});
