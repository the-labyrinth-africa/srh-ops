import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { GET as getClients, POST as createClient } from "@/app/api/clients/route";

describe("API Auth & Permissions Enforcement (app/api/*)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should return 401 Unauthenticated if user has no active session", async () => {
    vi.mocked(nextAuth.getServerSession).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/clients");
    const res = await getClients();
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Non authentifié");
  });

  it("should return 403 Forbidden for 'lecture' role trying to write (POST)", async () => {
    vi.mocked(nextAuth.getServerSession).mockResolvedValue({
      user: {
        id: "507f1f77bcf86cd799439099",
        nom: "User ReadOnly",
        email: "read@srh.ci",
        role: "lecture",
      },
    } as any);

    const req = new NextRequest("http://localhost:3000/api/clients", {
      method: "POST",
      body: JSON.stringify({
        nom: "Nouveau Client Non Autorisé",
      }),
    });

    const res = await createClient(req);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toBe("Permission insuffisante");
  });

  it("should allow GET for 'lecture' role", async () => {
    vi.mocked(nextAuth.getServerSession).mockResolvedValue({
      user: {
        id: "507f1f77bcf86cd799439099",
        nom: "User ReadOnly",
        email: "read@srh.ci",
        role: "lecture",
      },
    } as any);

    const res = await getClients();
    expect(res.status).toBe(200);
  });
});
