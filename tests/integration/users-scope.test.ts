import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { POST as createUser } from "@/app/api/users/route";
import { PUT as updateUser } from "@/app/api/users/[id]/route";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Equipe } from "@/backend/equipes/infrastructure/mongoose/equipe.model";
import { User } from "@/models/User";

function asAdmin() {
  vi.mocked(nextAuth.getServerSession).mockResolvedValue({
    user: { id: "507f1f77bcf86cd799439011", name: "Admin", email: "a@srh.ci", username: "admin", role: "admin" },
  } as never);
}

const create = (body: Record<string, unknown>) =>
  createUser(new NextRequest("http://localhost:3000/api/users", { method: "POST", body: JSON.stringify(body) }));

const base = { nom: "Jean K", telephone: "" };

describe("rattachement des comptes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    asAdmin();
  });

  it("refuse un compte client sans clientId et ne crée rien", async () => {
    const res = await create({ ...base, username: "cli1", email: "cli1@srh.ci", role: "client" });
    expect(res.status).toBe(400);
    expect(await User.countDocuments({ username: "cli1" })).toBe(0);
  });

  it("refuse un clientId qui n'existe pas", async () => {
    const res = await create({ ...base, username: "cli2", email: "cli2@srh.ci", role: "client", clientId: "507f1f77bcf86cd799439099" });
    expect(res.status).toBe(400);
    expect(await User.countDocuments({ username: "cli2" })).toBe(0);
  });

  it("crée un compte client rattaché à un client existant", async () => {
    const client = await Client.create({ nom: "Client A" });
    const res = await create({ ...base, username: "cli3", email: "cli3@srh.ci", role: "client", clientId: String(client._id) });
    expect(res.status).toBe(201);
    const user = await User.findOne({ username: "cli3" });
    expect(String(user?.clientId)).toBe(String(client._id));
  });

  it("refuse un chauffeur sans équipe, ou avec une équipe inconnue", async () => {
    const r1 = await create({ ...base, username: "ch1", email: "ch1@srh.ci", role: "chauffeur" });
    const r2 = await create({ ...base, username: "ch2", email: "ch2@srh.ci", role: "chauffeur", equipeId: "507f1f77bcf86cd799439099" });
    expect(r1.status).toBe(400);
    expect(r2.status).toBe(400);
    expect(await User.countDocuments({ username: { $in: ["ch1", "ch2"] } })).toBe(0);
  });

  it("crée un chauffeur rattaché à une équipe existante", async () => {
    const equipe = await Equipe.create({ nom: "Équipe 1" });
    const res = await create({ ...base, username: "ch3", email: "ch3@srh.ci", role: "chauffeur", equipeId: String(equipe._id) });
    expect(res.status).toBe(201);
  });

  it("à la mise à jour, changer un client en dispatcher retire son rattachement en base", async () => {
    const client = await Client.create({ nom: "Client B" });
    const user = await User.create({
      username: "cli4", nom: "Cli 4", email: "cli4@srh.ci", motDePasseHash: "x",
      role: "client", clientId: client._id,
    });

    const res = await updateUser(
      new NextRequest(`http://localhost:3000/api/users/${user._id}`, {
        method: "PUT",
        body: JSON.stringify({ nom: "Cli 4", email: "cli4@srh.ci", role: "dispatcher", telephone: "", clientId: "" }),
      }),
      { params: Promise.resolve({ id: String(user._id) }) }
    );

    expect(res.status).toBe(200);
    const after = await User.findById(user._id).lean<{ role?: string; clientId?: unknown }>();
    expect(after?.role).toBe("dispatcher");
    expect(after?.clientId).toBeUndefined();
  });

  const put = (id: unknown, body: Record<string, unknown>) =>
    updateUser(
      new NextRequest(`http://localhost:3000/api/users/${id}`, { method: "PUT", body: JSON.stringify(body) }),
      { params: Promise.resolve({ id: String(id) }) }
    );

  it("à la mise à jour, un client passe à un autre client existant et la base suit", async () => {
    const a = await Client.create({ nom: "Client C" });
    const b = await Client.create({ nom: "Client D" });
    const user = await User.create({
      username: "cli5", nom: "Cli 5", email: "cli5@srh.ci", motDePasseHash: "x",
      role: "client", clientId: a._id,
    });

    const res = await put(user._id, {
      nom: "Cli 5", email: "cli5@srh.ci", role: "client", telephone: "", clientId: String(b._id),
    });

    expect(res.status).toBe(200);
    const after = await User.findById(user._id).lean<{ role?: string; clientId?: unknown }>();
    expect(after?.role).toBe("client");
    expect(String(after?.clientId)).toBe(String(b._id));
  });

  it("à la mise à jour, un clientId inconnu est refusé (400) et la base est inchangée", async () => {
    const a = await Client.create({ nom: "Client E" });
    const user = await User.create({
      username: "cli6", nom: "Cli 6", email: "cli6@srh.ci", motDePasseHash: "x",
      role: "client", clientId: a._id,
    });

    const res = await put(user._id, {
      nom: "Autre nom", email: "cli6@srh.ci", role: "client", telephone: "",
      clientId: "507f1f77bcf86cd799439099",
    });

    expect(res.status).toBe(400);
    const after = await User.findById(user._id).lean<{ nom?: string; clientId?: unknown }>();
    expect(after?.nom).toBe("Cli 6");
    expect(String(after?.clientId)).toBe(String(a._id));
  });

  it("à la mise à jour, une équipe inconnue pour un chauffeur est refusée (400) et la base est inchangée", async () => {
    const equipe = await Equipe.create({ nom: "Équipe 2" });
    const user = await User.create({
      username: "ch4", nom: "Ch 4", email: "ch4@srh.ci", motDePasseHash: "x",
      role: "chauffeur", equipeId: equipe._id,
    });

    const res = await put(user._id, {
      nom: "Autre nom", email: "ch4@srh.ci", role: "chauffeur", telephone: "",
      equipeId: "507f1f77bcf86cd799439099",
    });

    expect(res.status).toBe(400);
    const after = await User.findById(user._id).lean<{ nom?: string; equipeId?: unknown }>();
    expect(after?.nom).toBe("Ch 4");
    expect(String(after?.equipeId)).toBe(String(equipe._id));
  });
});
