import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { PUT as updateUser, DELETE as deleteUser } from "@/app/api/users/[id]/route";
import { User } from "@/models/User";

function mockSession(role: string) {
  vi.mocked(nextAuth.getServerSession).mockResolvedValue({
    user: { id: "507f1f77bcf86cd799439011", name: "S", email: "s@srh.ci", username: "s", role },
  } as never);
}

async function seedTarget(suffix: string) {
  return User.create({
    username: `authz_${suffix}`, nom: "Cible", email: `authz_${suffix}@srh.ci`,
    motDePasseHash: "x", role: "dispatcher",
  });
}

describe("PUT/DELETE /api/users/[id] : refus pour les rôles non administrateurs", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(["dispatcher", "lecture", "chauffeur", "client"])("%s : PUT refusé (403), compte inchangé", async (role) => {
    mockSession(role);
    const target = await seedTarget(`put_${role}`);
    const id = String(target._id);
    const res = await updateUser(
      new NextRequest(`http://localhost:3000/api/users/${id}`, {
        method: "PUT",
        body: JSON.stringify({ nom: "Piraté", email: "pirate@srh.ci", role: "admin", telephone: "" }),
      }),
      { params: Promise.resolve({ id }) }
    );
    expect(res.status).toBe(403);
    const after = (await User.findById(id))!;
    expect(after.nom).toBe("Cible");
    expect(after.role).toBe("dispatcher");
    expect(after.email).toBe(`authz_put_${role}@srh.ci`);
  });

  it.each(["dispatcher", "lecture", "chauffeur", "client"])("%s : DELETE refusé (403), compte conservé", async (role) => {
    mockSession(role);
    const target = await seedTarget(`del_${role}`);
    const id = String(target._id);
    const res = await deleteUser(
      new NextRequest(`http://localhost:3000/api/users/${id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id }) }
    );
    expect(res.status).toBe(403);
    expect(await User.findById(id)).not.toBeNull();
  });
});
