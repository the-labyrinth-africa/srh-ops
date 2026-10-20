import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";
import { GET, POST } from "@/app/api/plateforme/premier-admin/route";
import { User } from "@/backend/comptes/infrastructure/mongoose/utilisateur.model";
import { getMemoryTransport } from "@/backend/platform/email";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

function asRole(role: "admin" | "superadmin") {
  vi.mocked(nextAuth.getServerSession).mockResolvedValue({
    user: {
      id: "507f1f77bcf86cd799439011",
      name: "Compte de test",
      email: "test@example.com",
      username: "test",
      role,
      mustChangePassword: false,
    },
  } as never);
}

function creer(body: Record<string, string>) {
  return POST(
    new NextRequest("http://localhost:3000/api/plateforme/premier-admin", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
}

describe("provisionnement du premier Admin Ops", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    getMemoryTransport().reset();
    process.env.NEXTAUTH_URL = "https://ops.example.test";
    asRole("superadmin");
    await User.init();
  });

  it("réserve la création au superadmin et impose le rôle admin", async () => {
    asRole("admin");
    const interdit = await creer({
      username: "ops-admin",
      nom: "Admin Ops",
      email: "ops@example.com",
    });
    expect(interdit.status).toBe(403);

    asRole("superadmin");
    const response = await creer({
      username: "ops-admin",
      nom: "Admin Ops",
      email: "ops@example.com",
      role: "superadmin",
    });
    expect(response.status).toBe(201);
    expect((await response.json()).user.role).toBe("admin");
    expect(await User.exists({ username: "ops-admin", role: "admin" })).toBeTruthy();
  });

  it("empêche les créations doublons, y compris deux requêtes concurrentes", async () => {
    const results = await Promise.all([
      creer({ username: "ops-admin-a", nom: "Admin Ops A", email: "ops-a@example.com" }),
      creer({ username: "ops-admin-b", nom: "Admin Ops B", email: "ops-b@example.com" }),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await User.countDocuments({ role: "admin" })).toBe(1);

    const suivant = await creer({
      username: "ops-admin-c",
      nom: "Admin Ops C",
      email: "ops-c@example.com",
    });
    expect(suivant.status).toBe(409);
  });

  it("conserve l'état d'initialisation même si le compte initial est supprimé", async () => {
    const response = await creer({
      username: "ops-admin",
      nom: "Admin Ops",
      email: "ops@example.com",
    });
    expect(response.status).toBe(201);
    await User.deleteOne({ username: "ops-admin" });

    const status = await GET();
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ adminInitialCree: true });
  });
});
