import { describe, it, expect, vi } from "vitest";
import { UtilisateurRepositoryMongoose } from "./utilisateur.repository.mongoose";
import { User as UserModel } from "./utilisateur.model";
import { Client as ClientModel } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Equipe as EquipeModel } from "@/backend/equipes/infrastructure/mongoose/equipe.model";
import type { UserRole } from "@/shared/acces/roles";

const depot = new UtilisateurRepositoryMongoose();

function saisie(
  overrides: Partial<{
    username: string;
    nom: string;
    email: string;
    role: UserRole;
    telephone: string;
    clientId?: string;
    equipeId?: string;
  }> = {}
) {
  return {
    username: "jdupont",
    nom: "Jean Dupont",
    email: "jean@srh.ci",
    role: "dispatcher" as UserRole,
    telephone: "0102030405",
    ...overrides,
  };
}

async function creerUnClient(nom = "Client Test") {
  const client = await ClientModel.create({ nom, contact: { telephone: "0102030405", email: "c@srh.ci" } });
  return String(client._id);
}

async function creerUneEquipe(nom = "Équipe Test") {
  const equipe = await EquipeModel.create({ nom, membres: [], disponibilite: true });
  return String(equipe._id);
}

describe("UtilisateurRepositoryMongoose (contrat)", () => {
  describe("clientId / equipeId — distinction à trois voies", () => {
    it("un utilisateur sans clientId ni equipeId (ex. admin) : les deux clés sont ABSENTES de l'entité, pas juste `undefined`", async () => {
      const cree = await depot.creer(saisie({ username: "admin1", email: "admin1@srh.ci", role: "admin" }), "hash");
      expect("clientId" in cree).toBe(false);
      expect("equipeId" in cree).toBe(false);

      const relu = await depot.trouverParId(cree.id);
      expect(relu).not.toBeNull();
      expect("clientId" in (relu as object)).toBe(false);
      expect("equipeId" in (relu as object)).toBe(false);

      const liste = await depot.lister();
      expect("clientId" in liste[0]).toBe(false);
      expect("equipeId" in liste[0]).toBe(false);
    });

    it("clientId peuplé ({id, nom}) pour un utilisateur rattaché à un client existant", async () => {
      const clientId = await creerUnClient("Client Alpha");
      const cree = await depot.creer(saisie({ username: "client1", email: "client1@srh.ci", role: "client", clientId }), "hash");
      expect(cree.clientId).toEqual({ id: clientId, nom: "Client Alpha" });

      const relu = await depot.trouverParId(cree.id);
      expect(relu?.clientId).toEqual({ id: clientId, nom: "Client Alpha" });
    });

    it("RÉGRESSION — référence pendante : après suppression directe du Client, clientId devient le null JSON réel (jamais la chaîne \"null\")", async () => {
      const clientId = await creerUnClient("Client à supprimer");
      const cree = await depot.creer(saisie({ username: "client2", email: "client2@srh.ci", role: "client", clientId }), "hash");
      await ClientModel.findByIdAndDelete(clientId);

      const relu = await depot.trouverParId(cree.id);
      expect(relu?.clientId).toBeNull();
      expect(typeof relu?.clientId).not.toBe("string");

      const liste = await depot.lister();
      expect(liste[0].clientId).toBeNull();
    });

    it("même comportement pour equipeId : peuplé puis null après suppression de l'Équipe référencée", async () => {
      const equipeId = await creerUneEquipe("Équipe Alpha");
      const cree = await depot.creer(saisie({ username: "disp1", email: "disp1@srh.ci", equipeId }), "hash");
      expect(cree.equipeId).toEqual({ id: equipeId, nom: "Équipe Alpha" });

      await EquipeModel.findByIdAndDelete(equipeId);
      const relu = await depot.trouverParId(cree.id);
      expect(relu?.equipeId).toBeNull();
    });

    it("crée avec un clientId inexistant sans lever d'erreur (aucune contrainte FK côté Mongo) : peuplement impossible → null", async () => {
      const cree = await depot.creer(
        saisie({ username: "orphelin", email: "orphelin@srh.ci", role: "client", clientId: "507f1f77bcf86cd799439099" }),
        "hash"
      );
      expect(cree.clientId).toBeNull();
    });
  });

  describe("CRUD", () => {
    it("creer : normalise username/email en minuscules, mustChangePassword=true, jamais motDePasseHash", async () => {
      const cree = await depot.creer(saisie({ username: "JDupont", email: "Jean@SRH.CI" }), "hash-bidon");
      expect(cree.username).toBe("jdupont");
      expect(cree.email).toBe("jean@srh.ci");
      expect(cree.mustChangePassword).toBe(true);
      expect(cree).not.toHaveProperty("motDePasseHash");
      expect(cree.id).toMatch(/^[a-f\d]{24}$/);
      expect(cree.createdAt).toBeInstanceOf(Date);
    });

    it("creer : si la relecture peuplée échoue (ex. suppression concurrente), replie sur le document tout juste créé plutôt que de lever", async () => {
      // Simule la fenêtre de course : la relecture post-création (`findById(...).select(...).populate(...)
      // .populate(...).lean()`) revient `null`, comme si le compte avait été supprimé entre les deux appels.
      const spy = vi.spyOn(UserModel, "findById").mockReturnValueOnce({
        select: () => ({
          populate: () => ({
            populate: () => ({
              lean: () => Promise.resolve(null),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof UserModel.findById>);

      const cree = await depot.creer(saisie({ username: "racecondition", email: "race@srh.ci" }), "hash-secret");
      spy.mockRestore();

      expect(cree.username).toBe("racecondition");
      expect(cree.email).toBe("race@srh.ci");
      expect(cree.id).toMatch(/^[a-f\d]{24}$/);
      // Le repli utilise `doc.toObject()` (qui porte encore motDePasseHash en interne) mais
      // `versEntite` ne lit que des champs nommés : jamais recopié dans l'entité renvoyée.
      expect(cree).not.toHaveProperty("motDePasseHash");

      // Le document existe réellement en base (la simulation ne portait que sur la relecture) :
      // vérifiable via une lecture normale, non stubée.
      const relu = await depot.trouverParId(cree.id);
      expect(relu?.username).toBe("racecondition");
    });

    it("lister : jamais motDePasseHash, tous les utilisateurs créés sont renvoyés", async () => {
      await depot.creer(saisie({ username: "u1", email: "u1@srh.ci" }), "h1");
      await depot.creer(saisie({ username: "u2", email: "u2@srh.ci" }), "h2");
      const liste = await depot.lister();
      expect(liste.map((u) => u.username).sort()).toEqual(["u1", "u2"]);
      for (const u of liste) expect(u).not.toHaveProperty("motDePasseHash");
    });

    it("lister filtre par role", async () => {
      await depot.creer(saisie({ username: "adm", email: "adm@srh.ci", role: "admin" }), "h");
      await depot.creer(saisie({ username: "disp", email: "disp@srh.ci", role: "dispatcher" }), "h");
      expect((await depot.lister("admin")).map((u) => u.username)).toEqual(["adm"]);
    });

    it("trouverParId renvoie null pour un identifiant inconnu", async () => {
      expect(await depot.trouverParId("507f1f77bcf86cd799439099")).toBeNull();
    });

    it("modifier applique $set/$unset (clientId retiré si absent de la saisie) et n'affecte jamais username", async () => {
      const clientId = await creerUnClient("Client X");
      const cree = await depot.creer(
        saisie({ username: "u3", email: "u3@srh.ci", role: "client", clientId }),
        "h"
      );
      const modifie = await depot.modifier(
        cree.id,
        saisie({ username: "changed-username", email: "u3@srh.ci", nom: "Nouveau Nom", role: "client" })
      );
      expect(modifie?.nom).toBe("Nouveau Nom");
      expect(modifie?.username).toBe("u3"); // inchangé : jamais modifiable via `modifier`
      expect("clientId" in (modifie as object)).toBe(false); // $unset a bien retiré le rattachement
    });

    it("modifier renvoie null pour un identifiant inconnu", async () => {
      expect(await depot.modifier("507f1f77bcf86cd799439099", saisie())).toBeNull();
    });

    it("supprimer signale succès puis absence", async () => {
      const cree = await depot.creer(saisie(), "h");
      expect(await depot.supprimer(cree.id)).toBe(true);
      expect(await depot.supprimer(cree.id)).toBe(false);
    });
  });

  describe("existeEmailOuUsername", () => {
    it("détecte séparément la collision d'email et de username", async () => {
      await depot.creer(saisie({ username: "existant", email: "existant@srh.ci" }), "h");
      expect(await depot.existeEmailOuUsername("existant@srh.ci", "libre")).toEqual({ email: true, username: false });
      expect(await depot.existeEmailOuUsername("libre@srh.ci", "existant")).toEqual({ email: false, username: true });
      expect(await depot.existeEmailOuUsername("libre@srh.ci", "libre")).toEqual({ email: false, username: false });
    });

    it("insensible à la casse", async () => {
      await depot.creer(saisie({ username: "casse", email: "casse@srh.ci" }), "h");
      expect(await depot.existeEmailOuUsername("CASSE@SRH.CI", "autre")).toEqual({ email: true, username: false });
    });
  });

  describe("trouverProjectionParIdentifiant", () => {
    it("trouve par e-mail (présence d'un @) insensible à la casse", async () => {
      await depot.creer(saisie({ username: "proj1", email: "proj1@srh.ci", nom: "Projection Un" }), "h");
      const res = await depot.trouverProjectionParIdentifiant("PROJ1@SRH.CI");
      expect(res).toMatchObject({ nom: "Projection Un", email: "proj1@srh.ci" });
    });

    it("trouve par username (absence de @) insensible à la casse", async () => {
      await depot.creer(saisie({ username: "proj2", email: "proj2@srh.ci", nom: "Projection Deux" }), "h");
      const res = await depot.trouverProjectionParIdentifiant("PROJ2");
      expect(res).toMatchObject({ nom: "Projection Deux" });
    });

    it("null si inconnu", async () => {
      expect(await depot.trouverProjectionParIdentifiant("inconnu@srh.ci")).toBeNull();
    });
  });

  describe("changerMotDePasse", () => {
    it("pose passwordChangedAt seulement si demandé ; met toujours à jour mustChangePassword", async () => {
      const cree = await depot.creer(saisie({ username: "pwd1", email: "pwd1@srh.ci" }), "h");

      const sansDate = await depot.changerMotDePasse(cree.id, "nouveau-hash", {
        mustChangePassword: false,
        poserPasswordChangedAt: false,
      });
      expect(sansDate).toMatchObject({ nom: cree.nom, email: cree.email });
      const relu1 = await depot.trouverParId(cree.id);
      expect(relu1?.passwordChangedAt).toBeUndefined();
      expect(relu1?.mustChangePassword).toBe(false);

      await depot.changerMotDePasse(cree.id, "autre-hash", { mustChangePassword: true, poserPasswordChangedAt: true });
      const relu2 = await depot.trouverParId(cree.id);
      expect(relu2?.passwordChangedAt).toBeInstanceOf(Date);
      expect(relu2?.mustChangePassword).toBe(true);
    });

    it("renvoie null pour un identifiant inconnu", async () => {
      expect(
        await depot.changerMotDePasse("507f1f77bcf86cd799439099", "h", {
          mustChangePassword: false,
          poserPasswordChangedAt: false,
        })
      ).toBeNull();
    });
  });

  describe("trouverHashMotDePasse", () => {
    it("est la SEULE méthode du dépôt à renvoyer le hash", async () => {
      const cree = await depot.creer(saisie({ username: "hashuser", email: "hashuser@srh.ci" }), "hash-secret");
      expect(await depot.trouverHashMotDePasse(cree.id)).toBe("hash-secret");
      expect(await depot.trouverHashMotDePasse("507f1f77bcf86cd799439099")).toBeNull();
    });
  });
});
