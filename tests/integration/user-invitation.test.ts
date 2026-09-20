import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";
import bcrypt from "bcryptjs";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { POST as createUser } from "@/app/api/users/route";
import { POST as reset } from "@/app/api/auth/reset-password/route";
import { getMemoryTransport } from "@/lib/mail";
import { User } from "@/models/User";
import { PasswordResetToken } from "@/models/PasswordResetToken";

function asAdmin() {
  vi.mocked(nextAuth.getServerSession).mockResolvedValue({
    user: { id: "507f1f77bcf86cd799439011", name: "Admin", email: "a@srh.ci", username: "admin", role: "admin" },
  } as never);
}

const create = () =>
  createUser(
    new NextRequest("http://localhost:3000/api/users", {
      method: "POST",
      body: JSON.stringify({ username: "awa", nom: "Awa Koné", email: "awa@srh.ci", role: "dispatcher", telephone: "" }),
    })
  );

describe("POST /api/users : invitation par e-mail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getMemoryTransport().reset();
    process.env.NEXTAUTH_URL = "https://ops.srh.ci";
    asAdmin();
  });

  it("envoi réussi : invitation envoyée, aucun mot de passe dans la réponse", async () => {
    const res = await create();
    expect(res.status).toBe(201);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const data = await res.json();

    expect(data.invitation).toBe("sent");
    expect(data.generatedPassword).toBeUndefined();
    expect(JSON.stringify(data)).not.toMatch(/mot de passe temporaire\s*:/i);
    expect(getMemoryTransport().sent).toHaveLength(1);
    expect(getMemoryTransport().sent[0].to).toBe("awa@srh.ci");
    expect(getMemoryTransport().sent[0].text).toContain("https://ops.srh.ci/reset-password?token=");
    expect(await PasswordResetToken.countDocuments({ purpose: "invitation" })).toBe(1);
  });

  it("le lien d'invitation permet de choisir son mot de passe et de se connecter", async () => {
    await create();
    const text = getMemoryTransport().sent[0].text;
    const token = text.match(/token=([A-Za-z0-9_-]{43})/)![1];

    const res = await reset(
      new NextRequest("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.5" },
        body: JSON.stringify({ token, newPassword: "MonMdp123" }),
      })
    );
    expect(res.status).toBe(200);
    const user = await User.findOne({ email: "awa@srh.ci" });
    expect(await bcrypt.compare("MonMdp123", user!.motDePasseHash)).toBe(true);
    expect(user?.mustChangePassword).toBe(false);
  });

  it("échec d'envoi : repli sur le mot de passe temporaire affiché à l'administrateur", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getMemoryTransport().failNext();

    const res = await create();
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.invitation).toBe("not_sent");
    expect(typeof data.generatedPassword).toBe("string");
    expect(data.generatedPassword.length).toBeGreaterThanOrEqual(8);
    expect(data.message).not.toContain(data.generatedPassword);

    const user = await User.findOne({ email: "awa@srh.ci" });
    expect(await bcrypt.compare(data.generatedPassword, user!.motDePasseHash)).toBe(true);
    expect(user?.mustChangePassword).toBe(true);
  });

  it("NEXTAUTH_URL absent : repli sur le mot de passe temporaire, sans lever", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.NEXTAUTH_URL;
    const res = await create();
    expect(res.status).toBe(201);
    expect((await res.json()).invitation).toBe("not_sent");
  });
});
