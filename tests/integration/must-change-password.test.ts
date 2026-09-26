import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";
import bcrypt from "bcryptjs";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { GET as listOperations } from "@/app/api/operations/route";
import { POST as changePassword } from "@/app/api/auth/change-password/route";
import { User } from "@/backend/comptes/infrastructure/mongoose/utilisateur.model";
import { PasswordResetToken } from "@/backend/comptes/infrastructure/mongoose/jeton.model";
import { issueResetToken, consumeResetToken } from "@/lib/auth/reset-token";

function session(user: Record<string, unknown>) {
  vi.mocked(nextAuth.getServerSession).mockResolvedValue({
    user: { name: "T", email: "t@srh.ci", username: "t", ...user },
  } as never);
}

describe("changement de mot de passe obligatoire", () => {
  beforeEach(() => vi.resetAllMocks());

  it("bloque les API métier tant que le mot de passe temporaire n'est pas changé", async () => {
    session({ id: "507f1f77bcf86cd799439011", role: "admin", mustChangePassword: true });
    const res = await listOperations(new NextRequest("http://localhost:3000/api/operations"));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("MUST_CHANGE_PASSWORD");
  });

  it("laisse passer les comptes sans drapeau", async () => {
    session({ id: "507f1f77bcf86cd799439011", role: "admin", mustChangePassword: false });
    const res = await listOperations(new NextRequest("http://localhost:3000/api/operations"));
    expect(res.status).toBe(200);
  });

  it("traite une session sans utilisateur (jeton invalidé) comme non authentifiée", async () => {
    vi.mocked(nextAuth.getServerSession).mockResolvedValue({ expires: "2099-01-01" } as never);
    const res = await listOperations(new NextRequest("http://localhost:3000/api/operations"));
    expect(res.status).toBe(401);
  });

  it("autorise change-password malgré le drapeau et lève le drapeau en base", async () => {
    const user = await User.create({
      username: "tmp", nom: "Tmp", email: "tmp@srh.ci",
      motDePasseHash: await bcrypt.hash("Temp0raire!", 10),
      role: "dispatcher", mustChangePassword: true,
    });
    session({ id: String(user._id), role: "dispatcher", mustChangePassword: true });

    const res = await changePassword(
      new NextRequest("http://localhost:3000/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: "Temp0raire!", newPassword: "NouveauMdp1" }),
      })
    );

    expect(res.status).toBe(200);
    const after = await User.findById(user._id);
    expect(after?.mustChangePassword).toBe(false);
    expect(await bcrypt.compare("NouveauMdp1", after!.motDePasseHash)).toBe(true);
    // Changement volontaire : passwordChangedAt reste non défini, sinon l'utilisateur
    // perdrait sa propre session (invalidation réservée aux réinitialisations).
    expect(after?.passwordChangedAt).toBeUndefined();
  });

  it("refuse un nouveau mot de passe identique à l'actuel", async () => {
    const hash = await bcrypt.hash("Temp0raire!", 10);
    const user = await User.create({
      username: "same", nom: "Same", email: "same@srh.ci",
      motDePasseHash: hash, role: "dispatcher", mustChangePassword: true,
    });
    session({ id: String(user._id), role: "dispatcher", mustChangePassword: true });

    const res = await changePassword(
      new NextRequest("http://localhost:3000/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: "Temp0raire!", newPassword: "Temp0raire!" }),
      })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Le nouveau mot de passe doit être différent de l'ancien");
    const after = await User.findById(user._id);
    expect(after?.motDePasseHash).toBe(hash);
    expect(after?.mustChangePassword).toBe(true);
  });

  it("le changement volontaire révoque les liens en attente (invitation de repli comprise)", async () => {
    const user = await User.create({
      username: "tmp2", nom: "Tmp2", email: "tmp2@srh.ci",
      motDePasseHash: await bcrypt.hash("Temp0raire!", 10),
      role: "dispatcher", mustChangePassword: true,
    });
    const other = await User.create({
      username: "autre", nom: "Autre", email: "autre@srh.ci", motDePasseHash: "x", role: "dispatcher",
    });
    const pending = await issueResetToken(String(user._id), "invitation");
    const untouched = await issueResetToken(String(other._id), "invitation");
    session({ id: String(user._id), role: "dispatcher", mustChangePassword: true });

    const res = await changePassword(
      new NextRequest("http://localhost:3000/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: "Temp0raire!", newPassword: "NouveauMdp1" }),
      })
    );

    expect(res.status).toBe(200);
    expect(await PasswordResetToken.countDocuments({ userId: user._id, usedAt: null })).toBe(0);
    expect(await consumeResetToken(pending.token)).toBeNull();
    // Les jetons des autres comptes ne sont pas touchés.
    expect(await consumeResetToken(untouched.token)).toEqual({ userId: String(other._id), purpose: "invitation" });
  });

  it("un changement refusé (mauvais mot de passe actuel) ne révoque rien", async () => {
    const user = await User.create({
      username: "tmp3", nom: "Tmp3", email: "tmp3@srh.ci",
      motDePasseHash: await bcrypt.hash("Temp0raire!", 10), role: "dispatcher",
    });
    const pending = await issueResetToken(String(user._id), "invitation");
    session({ id: String(user._id), role: "dispatcher" });

    const res = await changePassword(
      new NextRequest("http://localhost:3000/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: "Mauvais1234", newPassword: "NouveauMdp1" }),
      })
    );

    expect(res.status).toBe(400);
    expect(await consumeResetToken(pending.token)).toEqual({ userId: String(user._id), purpose: "invitation" });
  });
});
