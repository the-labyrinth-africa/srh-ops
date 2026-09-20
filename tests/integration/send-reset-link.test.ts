import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";
import bcrypt from "bcryptjs";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { POST as sendLink } from "@/app/api/users/[id]/send-reset-link/route";
import { consumeResetToken } from "@/lib/auth/reset-token";
import { getMemoryTransport } from "@/lib/mail";
import { User } from "@/models/User";

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
  });

  it("identifiant invalide : 400 ; compte inconnu : 404", async () => {
    session("admin");
    expect((await call("pas-un-id")).status).toBe(400);
    expect((await call("507f1f77bcf86cd799439099")).status).toBe(404);
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
});
