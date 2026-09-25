import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";
import bcrypt from "bcryptjs";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { POST as sendLink } from "@/app/api/users/[id]/send-reset-link/route";
import { consumeResetToken, issueResetToken } from "@/lib/auth/reset-token";
import { getMemoryTransport } from "@/backend/platform/email";
import * as rateLimit from "@/backend/platform/limiteur-debit/rate-limit";
import { User } from "@/models/User";
import { PasswordResetToken } from "@/models/PasswordResetToken";

function session(role: string) {
  vi.mocked(nextAuth.getServerSession).mockResolvedValue({
    user: { id: "507f1f77bcf86cd799439011", name: "S", email: "s@srh.ci", username: "s", role },
  } as never);
}
const call = (id: string) =>
  sendLink(new NextRequest(`http://localhost:3000/api/users/${id}/send-reset-link`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });

async function seedTarget() {
  return User.create({
    username: "cible", nom: "Cible", email: "cible@srh.ci",
    motDePasseHash: await bcrypt.hash("Ancien1234", 10), role: "dispatcher",
  });
}

describe("POST /api/users/[id]/send-reset-link", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getMemoryTransport().reset();
    process.env.NEXTAUTH_URL = "https://ops.srh.ci";
  });

  it("admin : envoie un lien valable, sans toucher au mot de passe", async () => {
    const target = await seedTarget();
    session("admin");
    const res = await call(String(target._id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true });

    const mail = getMemoryTransport().sent[0];
    expect(mail.to).toBe("cible@srh.ci");
    const token = mail.text.match(/token=([A-Za-z0-9_-]{43})/)![1];
    expect(await consumeResetToken(token)).toEqual({ userId: String(target._id), purpose: "reset" });
    const after = await User.findById(target._id);
    expect(after?.motDePasseHash).toBe(target.motDePasseHash);
  });

  it.each(["dispatcher", "lecture", "chauffeur", "client"])("%s : 403 et aucun e-mail", async (role) => {
    const target = await seedTarget();
    session(role);
    expect((await call(String(target._id))).status).toBe(403);
    expect(getMemoryTransport().sent).toHaveLength(0);
    expect(await PasswordResetToken.countDocuments({})).toBe(0);
  });

  it("identifiant invalide : 400 ; compte inconnu : 404", async () => {
    session("admin");
    expect((await call("pas-un-id")).status).toBe(400);
    expect((await call("507f1f77bcf86cd799439099")).status).toBe(404);
  });

  it("no-store sur les refus 403, 400 et 404", async () => {
    const target = await seedTarget();
    session("dispatcher");
    expect((await call(String(target._id))).headers.get("Cache-Control")).toBe("no-store");
    session("admin");
    const bad = await call("pas-un-id");
    expect(bad.status).toBe(400);
    expect(bad.headers.get("Cache-Control")).toBe("no-store");
    const unknown = await call("507f1f77bcf86cd799439099");
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get("Cache-Control")).toBe("no-store");
  });

  it("NEXTAUTH_URL absent : 502 not_configured et le jeton précédent n'est pas remplacé", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const target = await seedTarget();
    session("admin");
    const { token } = await issueResetToken(String(target._id), "reset");
    delete process.env.NEXTAUTH_URL;

    const res = await call(String(target._id));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ sent: false, reason: "not_configured" });
    expect(await consumeResetToken(token)).toEqual({ userId: String(target._id), purpose: "reset" });
  });

  it("échec d'envoi : 502 avec la raison", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const target = await seedTarget();
    session("admin");
    getMemoryTransport().failNext();
    const res = await call(String(target._id));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ sent: false, reason: "send_failed" });
  });

  it("limite : 5 liens par heure et par compte ciblé", async () => {
    const target = await seedTarget();
    session("admin");
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await call(String(target._id))).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it("limiteur en panne : 503 générique, rien envoyé, aucun jeton créé, aucun secret journalisé", async () => {
    const target = await seedTarget();
    session("admin");
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {})
    );
    vi.spyOn(rateLimit, "consumeRateLimit").mockRejectedValue(new Error("mongodb://secret@hote"));

    const res = await call(String(target._id));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Service momentanément indisponible. Réessayez plus tard." });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(getMemoryTransport().sent).toHaveLength(0);
    expect(await PasswordResetToken.countDocuments({})).toBe(0);
    const output = spies.flatMap((s) => s.mock.calls).flat().map(String).join("\n");
    expect(output).toContain("[send-reset-link] limiteur indisponible");
    expect(output).not.toContain("mongodb://");
    expect(output).not.toContain("cible@srh.ci");
    vi.restoreAllMocks();
  });
});
