import { describe, it, expect } from "vitest";
import { EquipeRepositoryMongoose } from "./equipe.repository.mongoose";
import { RattachementsUtilisateursMongoose } from "./rattachements-utilisateurs.mongoose";
import { Equipe as EquipeModel } from "./equipe.model";
import { User } from "@/models/User";

const depot = new EquipeRepositoryMongoose();

describe("EquipeRepositoryMongoose (contrat)", () => {
  it("crée puis relit une équipe avec ses valeurs par défaut et sa révision", async () => {
    const creee = await depot.creer({ nom: "Équipe A", membres: ["Awa"], disponibilite: true });
    expect(creee.id).toMatch(/^[a-f\d]{24}$/);
    expect(creee.revision).toBe(0);
    expect(creee.createdAt).toBeInstanceOf(Date);
    expect(await depot.trouverParId(creee.id)).toMatchObject({ nom: "Équipe A", membres: ["Awa"] });
  });

  it("liste par nom croissant", async () => {
    await depot.creer({ nom: "Zeta", membres: [], disponibilite: true });
    await depot.creer({ nom: "Alpha", membres: [], disponibilite: true });
    expect((await depot.lister()).map((e) => e.nom)).toEqual(["Alpha", "Zeta"]);
  });

  it("modifie et renvoie la version mise à jour ; null pour un identifiant inconnu", async () => {
    const creee = await depot.creer({ nom: "A", membres: [], disponibilite: true });
    const modifiee = await depot.modifier(creee.id, { nom: "B", membres: ["x"], disponibilite: false });
    expect(modifiee).toMatchObject({ nom: "B", membres: ["x"], disponibilite: false });
    expect(await depot.modifier("507f1f77bcf86cd799439099", { nom: "B", membres: [], disponibilite: true })).toBeNull();
  });

  it("supprime et signale l'absence", async () => {
    const creee = await depot.creer({ nom: "A", membres: [], disponibilite: true });
    expect(await depot.supprimer(creee.id)).toBe(true);
    expect(await depot.supprimer(creee.id)).toBe(false);
    expect(await EquipeModel.countDocuments({})).toBe(0);
  });
});

describe("RattachementsUtilisateursMongoose", () => {
  it("détecte un compte rattaché à l'équipe", async () => {
    const equipe = await depot.creer({ nom: "A", membres: [], disponibilite: true });
    const rattachements = new RattachementsUtilisateursMongoose();
    expect(await rattachements.existePourEquipe(equipe.id)).toBe(false);
    await User.create({
      username: "chauf1", nom: "C", email: "c@srh.ci", motDePasseHash: "x", role: "chauffeur", equipeId: equipe.id,
    });
    expect(await rattachements.existePourEquipe(equipe.id)).toBe(true);
  });
});
