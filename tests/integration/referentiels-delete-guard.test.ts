import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { DELETE as deleteClient } from "@/app/api/clients/[id]/route";
import { DELETE as deleteEquipe } from "@/app/api/equipes/[id]/route";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Equipe } from "@/backend/equipes/infrastructure/mongoose/equipe.model";
import { User } from "@/models/User";

function asAdmin() {
  vi.mocked(nextAuth.getServerSession).mockResolvedValue({
    user: { id: "507f1f77bcf86cd799439011", name: "Admin", email: "a@srh.ci", username: "admin", role: "admin" },
  } as never);
}

const call = (fn: typeof deleteClient, base: string, id: string) =>
  fn(new NextRequest(`http://localhost:3000/api/${base}/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });

describe("suppression d'un référentiel rattaché à des comptes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    asAdmin();
  });

  it("refuse (409) de supprimer un client rattaché à un compte, qui reste en base", async () => {
    const client = await Client.create({ nom: "Client rattaché" });
    await User.create({
      username: "cli_guard", nom: "Cli", email: "cli_guard@srh.ci", motDePasseHash: "x",
      role: "client", clientId: client._id,
    });
    const res = await call(deleteClient, "clients", String(client._id));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("comptes utilisateurs");
    expect(await Client.exists({ _id: client._id })).toBeTruthy();
  });

  it("supprime un client sans compte rattaché", async () => {
    const client = await Client.create({ nom: "Client libre" });
    const res = await call(deleteClient, "clients", String(client._id));
    expect(res.status).toBe(200);
    expect(await Client.exists({ _id: client._id })).toBeNull();
  });

  it("refuse (409) de supprimer une équipe rattachée à un compte, qui reste en base", async () => {
    const equipe = await Equipe.create({ nom: "Équipe rattachée" });
    await User.create({
      username: "ch_guard", nom: "Ch", email: "ch_guard@srh.ci", motDePasseHash: "x",
      role: "chauffeur", equipeId: equipe._id,
    });
    const res = await call(deleteEquipe, "equipes", String(equipe._id));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("comptes utilisateurs");
    expect(await Equipe.exists({ _id: equipe._id })).toBeTruthy();
  });

  it("supprime une équipe sans compte rattaché", async () => {
    const equipe = await Equipe.create({ nom: "Équipe libre" });
    const res = await call(deleteEquipe, "equipes", String(equipe._id));
    expect(res.status).toBe(200);
    expect(await Equipe.exists({ _id: equipe._id })).toBeNull();
  });
});
