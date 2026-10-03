import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { Client } from "./infrastructure/mongoose/client.model";
import { existeClient } from "./index";

// Premier module chargé = `clients-sites` (l'autre sens de la dépendance circulaire avec `comptes`).
describe("existeClient (API publique de clients-sites)", () => {
  it("vrai pour un client existant, faux sinon", async () => {
    const client = await Client.create({ nom: "Client A" });
    expect(await existeClient(String(client._id))).toBe(true);
    expect(await existeClient(String(new mongoose.Types.ObjectId()))).toBe(false);
  });
});
