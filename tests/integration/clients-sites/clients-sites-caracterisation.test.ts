import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { GET as listerClients, POST as creerClient } from "@/app/api/clients/route";
import { GET as lireClient, PUT as modifierClient, DELETE as supprimerClient } from "@/app/api/clients/[id]/route";
import { GET as listerSites, POST as creerSiteRoute } from "@/app/api/sites/route";
import { GET as lireSite, PUT as modifierSite, DELETE as supprimerSite } from "@/app/api/sites/[id]/route";
import { Site } from "@/backend/clients-sites/infrastructure/mongoose/site.model";
import { Client as ClientModel } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { User } from "@/backend/comptes/infrastructure/mongoose/utilisateur.model";

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
 * Les routes `sites` (entité `Site` du même domaine) sont caractérisées dans la section
 * dédiée plus bas (tâche 2). Même principe : filet avant migration, pas de duplication de
 * la couverture d'autorisation déjà assurée ailleurs (`chauffeur-scope`, `authz-roles`).
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

    it("un `contact` vide remplace entièrement l'ancien : telephone prend le défaut Zod \"\" ; en base l'email disparaît (non réappliqué par Mongoose sur update), mais la réponse HTTP migrée le renvoie quand même \"\" via la normalisation de lecture du dépôt Mongoose (`versEntite`, écart connu vs. avant migration — voir rapport)", async () => {
      const cree = await creer({ nom: "A", contact: { telephone: "1", email: "a@srh.ci" } });
      const res = await modifierClient(put(cree._id, { nom: "B", contact: {} }), ctx(cree._id));
      expect(res.status).toBe(200);
      const corps = await res.json();
      expect(corps.nom).toBe("B");
      expect(corps.contact).toEqual({ telephone: "", email: "" });
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

    it("409 (pas 404) quand l'identifiant ne correspond à aucun client mais qu'un compte utilisateur le référence : le rattachement est vérifié avant l'existence du client", async () => {
      await User.create({
        username: "orphelin_guard",
        nom: "Orphelin",
        email: "orphelin_guard@srh.ci",
        motDePasseHash: "x",
        role: "client",
        clientId: ID_INCONNU,
      });
      const res = await supprimerClient(vide("DELETE", ID_INCONNU), ctx(ID_INCONNU));
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "Ce client est rattaché à des comptes utilisateurs" });
    });

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

const posteSite = (body: unknown) => json("POST", "/api/sites", body);
const putSite = (id: string, body: unknown) => json("PUT", `/api/sites/${id}`, body);
const videSite = (method: string, id: string) => new NextRequest(`http://localhost:3000/api/sites/${id}`, { method });
const listeSites = () => listerSites(new NextRequest("http://localhost:3000/api/sites"));

async function creerUnClient(nom = "Client Site") {
  const res = await creerClient(
    post({ nom, contact: { telephone: "0102030405", email: `${nom.toLowerCase().replace(/\s+/g, "")}@srh.ci` } })
  );
  expect(res.status).toBe(201);
  return (await res.json()) as Record<string, unknown> & { _id: string };
}

async function creerUnSite(clientId: string, corps: Record<string, unknown> = {}) {
  const res = await creerSiteRoute(posteSite({ clientId, nom: "Site A", ...corps }));
  expect(res.status).toBe(201);
  return (await res.json()) as Record<string, unknown> & { _id: string };
}

describe("clients-sites — caractérisation de l'API sites", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    asAdmin();
  });

  describe("GET /api/sites", () => {
    it("liste vide -> 200 et tableau vide", async () => {
      const res = await listeSites();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it("renvoie les sites triés par nom croissant, avec les valeurs et clientId peuplé ({_id, nom})", async () => {
      const client = await creerUnClient("Client Alpha");
      await creerUnSite(client._id, { nom: "Beta", adresse: "1 rue A" });
      await creerUnSite(client._id, { nom: "Alpha", adresse: "2 rue B" });
      const res = await listeSites();
      expect(res.status).toBe(200);
      const liste = await res.json();
      expect(liste.map((s: { nom: string }) => s.nom)).toEqual(["Alpha", "Beta"]);
      expect(liste[0].clientId).toEqual({ _id: client._id, nom: "Client Alpha" });
      expect(liste[0].adresse).toBe("2 rue B");
      expect(liste[1].clientId).toEqual({ _id: client._id, nom: "Client Alpha" });
    });

    it("401 sans session", async () => {
      session(null);
      const res = await listeSites();
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Non authentifié" });
    });

    it("403 pour un chauffeur", async () => {
      session({ role: "chauffeur", equipeId: ID_INCONNU });
      const res = await listeSites();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Accès refusé" });
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await listeSites();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: "Changement de mot de passe requis",
        code: "MUST_CHANGE_PASSWORD",
      });
    });
  });

  describe("POST /api/sites", () => {
    it("201 avec l'ensemble exact des clés, clientId NON peuplé (chaîne)", async () => {
      const client = await creerUnClient();
      const res = await creerSiteRoute(
        posteSite({
          clientId: client._id,
          nom: "Site Test",
          adresse: "1 rue du dépôt",
          localisation: { lat: 5.34, lng: -4.02 },
          typeDechets: ["DIB", "DEEE"],
          observations: "obs",
        })
      );
      expect(res.status).toBe(201);
      const corps = await res.json();
      expect(Object.keys(corps).sort()).toEqual(
        ["_id", "clientId", "nom", "adresse", "localisation", "typeDechets", "observations", "createdAt", "updatedAt", "__v"].sort()
      );
      expect(corps.clientId).toBe(client._id);
      expect(corps.nom).toBe("Site Test");
      expect(corps.adresse).toBe("1 rue du dépôt");
      expect(corps.typeDechets).toEqual(["DIB", "DEEE"]);
      expect(corps.observations).toBe("obs");
      expect(corps.__v).toBe(0);
      expect(new Date(corps.createdAt).toISOString()).toBe(corps.createdAt);
      expect(corps.updatedAt).toBe(corps.createdAt);
    });

    it("localisation absente du corps de la requête : n'apparaît pas dans la réponse (valeur observée, pas présumée)", async () => {
      const client = await creerUnClient();
      const corps = await creerUnSite(client._id, { nom: "Sans localisation" });
      expect(corps).not.toHaveProperty("localisation");
    });

    it("localisation fournie est conservée telle quelle", async () => {
      const client = await creerUnClient();
      const corps = await creerUnSite(client._id, { nom: "Avec localisation", localisation: { lat: 5.34, lng: -4.02 } });
      expect(corps.localisation).toEqual({ lat: 5.34, lng: -4.02 });
    });

    it("applique les valeurs par défaut (adresse, typeDechets, observations) quand omis", async () => {
      const client = await creerUnClient();
      const corps = await creerUnSite(client._id, { nom: "Minimal" });
      expect(corps.adresse).toBe("");
      expect(corps.typeDechets).toEqual([]);
      expect(corps.observations).toBe("");
    });

    it("réussit (201) avec un clientId inexistant : aucune vérification d'existence à l'écriture", async () => {
      const res = await creerSiteRoute(posteSite({ clientId: ID_INCONNU, nom: "Orphelin" }));
      expect(res.status).toBe(201);
      const corps = await res.json();
      expect(corps.clientId).toBe(ID_INCONNU);
    });

    it("400 si clientId est vide", async () => {
      const res = await creerSiteRoute(posteSite({ clientId: "", nom: "X" }));
      expect(res.status).toBe(400);
      expect((await res.json()).error.fieldErrors).toHaveProperty("clientId");
    });

    it("400 si nom est vide", async () => {
      const client = await creerUnClient();
      const res = await creerSiteRoute(posteSite({ clientId: client._id, nom: "" }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: { formErrors: [], fieldErrors: { nom: ["Le nom est requis"] } },
      });
    });

    it("400 si le corps a des types invalides", async () => {
      const res = await creerSiteRoute(posteSite({ clientId: 42, nom: 42, typeDechets: "pas-un-tableau" }));
      expect(res.status).toBe(400);
      const corps = await res.json();
      expect(corps.error.formErrors).toEqual([]);
      expect(Object.keys(corps.error.fieldErrors).sort()).toEqual(["clientId", "nom", "typeDechets"]);
    });

    it("401 sans session", async () => {
      session(null);
      expect((await creerSiteRoute(posteSite({ clientId: "x", nom: "X" }))).status).toBe(401);
    });

    it("403 pour un chauffeur", async () => {
      session({ role: "chauffeur", equipeId: ID_INCONNU });
      expect((await creerSiteRoute(posteSite({ clientId: "x", nom: "X" }))).status).toBe(403);
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await creerSiteRoute(posteSite({ clientId: "x", nom: "X" }));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("MUST_CHANGE_PASSWORD");
    });

    it("corps JSON malformé : le gestionnaire rejette et rien n'est créé", async () => {
      const malforme = new NextRequest("http://localhost:3000/api/sites", {
        method: "POST",
        body: "{ceci n'est pas du json",
      });
      await expect(creerSiteRoute(malforme)).rejects.toThrow();
      expect(await (await listeSites()).json()).toEqual([]);
    });
  });

  describe("GET /api/sites/[id]", () => {
    it("200 avec clientId peuplé ({_id, nom}), le reste identique à la réponse d'écriture", async () => {
      const client = await creerUnClient();
      const cree = await creerUnSite(client._id, { nom: "Alpha" });
      const res = await lireSite(videSite("GET", cree._id), ctx(cree._id));
      expect(res.status).toBe(200);
      const corps = await res.json();
      expect(corps.clientId).toEqual({ _id: client._id, nom: "Client Site" });
      expect(corps._id).toBe(cree._id);
      expect(corps.nom).toBe("Alpha");
    });

    it("404 « Non trouvé » pour un identifiant valide inconnu", async () => {
      const res = await lireSite(videSite("GET", ID_INCONNU), ctx(ID_INCONNU));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Non trouvé" });
    });

    it("400 « Identifiant invalide » pour un identifiant mal formé", async () => {
      const res = await lireSite(videSite("GET", "pas-un-id"), ctx("pas-un-id"));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Identifiant invalide" });
    });

    it("clientId: null (JSON, pas la chaîne \"null\") en détail et en liste quand le client référencé a été supprimé (référence pendante, aucune garde de rattachement sur Client) ; toujours 404 pour un compte client hors périmètre", async () => {
      const client = await creerUnClient("Client Supprime");
      const cree = await creerUnSite(client._id, { nom: "Site orphelin" });
      await ClientModel.findByIdAndDelete(client._id);

      const resDetail = await lireSite(videSite("GET", cree._id), ctx(cree._id));
      expect(resDetail.status).toBe(200);
      const corpsDetail = await resDetail.json();
      expect(corpsDetail.clientId).toBeNull();

      const resListe = await listeSites();
      expect(resListe.status).toBe(200);
      const liste = await resListe.json();
      const siteEnListe = liste.find((s: { _id: string }) => s._id === cree._id);
      expect(siteEnListe.clientId).toBeNull();

      session({ role: "client", clientId: ID_INCONNU });
      const resClient = await lireSite(videSite("GET", cree._id), ctx(cree._id));
      expect(resClient.status).toBe(404);
      expect(await resClient.json()).toEqual({ error: "Non trouvé" });
    });

    it("401 sans session, 403 chauffeur", async () => {
      const client = await creerUnClient();
      const cree = await creerUnSite(client._id);
      session(null);
      expect((await lireSite(videSite("GET", cree._id), ctx(cree._id))).status).toBe(401);
      session({ role: "chauffeur", equipeId: ID_INCONNU });
      expect((await lireSite(videSite("GET", cree._id), ctx(cree._id))).status).toBe(403);
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await lireSite(videSite("GET", ID_INCONNU), ctx(ID_INCONNU));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("MUST_CHANGE_PASSWORD");
    });
  });

  describe("PUT /api/sites/[id]", () => {
    it("200 : remplace les champs, clientId NON peuplé (chaîne), conserve _id/createdAt, avance updatedAt", async () => {
      const client = await creerUnClient();
      const cree = await creerUnSite(client._id, { nom: "Alpha" });
      await new Promise((r) => setTimeout(r, 5));
      const res = await modifierSite(
        putSite(cree._id, { clientId: client._id, nom: "Alpha modifié", adresse: "9 rue" }),
        ctx(cree._id)
      );
      expect(res.status).toBe(200);
      const corps = await res.json();
      expect(corps.clientId).toBe(client._id);
      expect(corps._id).toBe(cree._id);
      expect(corps.nom).toBe("Alpha modifié");
      expect(corps.adresse).toBe("9 rue");
      expect(corps.createdAt).toBe(cree.createdAt);
      expect(new Date(corps.updatedAt).getTime()).toBeGreaterThan(new Date(cree.updatedAt as string).getTime());
    });

    it("404 « Non trouvé » pour un identifiant inconnu", async () => {
      const res = await modifierSite(putSite(ID_INCONNU, { clientId: ID_INCONNU, nom: "B" }), ctx(ID_INCONNU));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Non trouvé" });
    });

    it("400 « Identifiant invalide » avant la validation du corps", async () => {
      const res = await modifierSite(putSite("pas-un-id", { clientId: "", nom: "" }), ctx("pas-un-id"));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Identifiant invalide" });
    });

    it("400 avec le détail Zod quand le corps est invalide, sans modifier le site", async () => {
      const client = await creerUnClient();
      const cree = await creerUnSite(client._id, { nom: "Alpha" });
      const res = await modifierSite(putSite(cree._id, { clientId: client._id, nom: "" }), ctx(cree._id));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: { formErrors: [], fieldErrors: { nom: ["Le nom est requis"] } },
      });
      const relu = await (await lireSite(videSite("GET", cree._id), ctx(cree._id))).json();
      expect(relu.nom).toBe("Alpha");
    });

    it("401 sans session, 403 chauffeur, 403 lecture", async () => {
      const client = await creerUnClient();
      const cree = await creerUnSite(client._id);
      const corps = { clientId: client._id, nom: "B" };
      session(null);
      expect((await modifierSite(putSite(cree._id, corps), ctx(cree._id))).status).toBe(401);
      session({ role: "chauffeur", equipeId: ID_INCONNU });
      expect((await modifierSite(putSite(cree._id, corps), ctx(cree._id))).status).toBe(403);
      session({ role: "lecture" });
      const res = await modifierSite(putSite(cree._id, corps), ctx(cree._id));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Permission insuffisante" });
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await modifierSite(putSite(ID_INCONNU, { clientId: "x", nom: "B" }), ctx(ID_INCONNU));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("MUST_CHANGE_PASSWORD");
    });

    it("corps JSON malformé : le gestionnaire rejette et le site reste inchangé", async () => {
      const client = await creerUnClient();
      const cree = await creerUnSite(client._id, { nom: "Avant" });
      const malforme = new NextRequest(`http://localhost:3000/api/sites/${cree._id}`, {
        method: "PUT",
        body: "{ceci n'est pas du json",
      });
      await expect(modifierSite(malforme, ctx(cree._id))).rejects.toThrow();
      const res = await lireSite(videSite("GET", cree._id), ctx(cree._id));
      expect((await res.json()).nom).toBe("Avant");
    });
  });

  describe("DELETE /api/sites/[id]", () => {
    it("200 { success: true } sans aucune garde de rattachement, puis 404 à la relecture", async () => {
      const client = await creerUnClient();
      const cree = await creerUnSite(client._id);
      const res = await supprimerSite(videSite("DELETE", cree._id), ctx(cree._id));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect((await lireSite(videSite("GET", cree._id), ctx(cree._id))).status).toBe(404);
    });

    it("404 « Non trouvé » pour un identifiant inconnu", async () => {
      const res = await supprimerSite(videSite("DELETE", ID_INCONNU), ctx(ID_INCONNU));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Non trouvé" });
    });

    it("400 « Identifiant invalide » pour un identifiant mal formé", async () => {
      const res = await supprimerSite(videSite("DELETE", "pas-un-id"), ctx("pas-un-id"));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Identifiant invalide" });
    });

    it("401 sans session, 403 chauffeur, 403 lecture ; le site reste présent", async () => {
      const client = await creerUnClient();
      const cree = await creerUnSite(client._id);
      session(null);
      expect((await supprimerSite(videSite("DELETE", cree._id), ctx(cree._id))).status).toBe(401);
      session({ role: "chauffeur", equipeId: ID_INCONNU });
      expect((await supprimerSite(videSite("DELETE", cree._id), ctx(cree._id))).status).toBe(403);
      session({ role: "lecture" });
      expect((await supprimerSite(videSite("DELETE", cree._id), ctx(cree._id))).status).toBe(403);
      asAdmin();
      expect((await lireSite(videSite("GET", cree._id), ctx(cree._id))).status).toBe(200);
    });

    it("403 MUST_CHANGE_PASSWORD", async () => {
      session({ role: "admin", mustChangePassword: true });
      const res = await supprimerSite(videSite("DELETE", ID_INCONNU), ctx(ID_INCONNU));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("MUST_CHANGE_PASSWORD");
    });
  });
});
