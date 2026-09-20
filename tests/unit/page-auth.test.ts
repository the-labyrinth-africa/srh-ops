import { describe, it, expect, vi, beforeEach } from "vitest";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { requirePageAccess } from "@/lib/page-auth";

function session(role: string) {
  vi.mocked(nextAuth.getServerSession).mockResolvedValue({
    user: { id: "507f1f77bcf86cd799439011", name: "T", email: "t@srh.ci", username: "t", role },
  } as never);
}

describe("requirePageAccess", () => {
  beforeEach(() => vi.resetAllMocks());

  it("redirige vers /login sans session", async () => {
    vi.mocked(nextAuth.getServerSession).mockResolvedValue(null as never);
    await expect(requirePageAccess("/")).rejects.toThrow("REDIRECT:/login");
  });

  it("renvoie la session quand le chemin est autorisé", async () => {
    session("admin");
    await expect(requirePageAccess("/utilisateurs")).resolves.toMatchObject({
      user: { role: "admin" },
    });
  });

  it.each([
    ["dispatcher", "/utilisateurs", "/"],
    ["lecture", "/import", "/"],
    ["lecture", "/operations/nouveau", "/"],
    ["chauffeur", "/", "/terrain"],
    ["chauffeur", "/clients", "/terrain"],
    ["client", "/", "/acces-limite"],
    ["client", "/operations", "/acces-limite"],
    ["client", "/terrain", "/acces-limite"],
  ])("%s ouvrant %s est redirigé vers %s", async (role, path, home) => {
    session(role);
    await expect(requirePageAccess(path)).rejects.toThrow(`REDIRECT:${home}`);
  });
});
