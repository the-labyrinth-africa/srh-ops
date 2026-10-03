import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { Equipe } from "./infrastructure/mongoose/equipe.model";
import { existeEquipe } from "./index";

// Premier module chargé = `equipes` (l'autre sens de la dépendance circulaire avec `comptes`).
describe("existeEquipe (API publique d'equipes)", () => {
  it("vrai pour une équipe existante, faux sinon", async () => {
    const equipe = await Equipe.create({ nom: "Équipe A" });
    expect(await existeEquipe(String(equipe._id))).toBe(true);
    expect(await existeEquipe(String(new mongoose.Types.ObjectId()))).toBe(false);
  });
});
