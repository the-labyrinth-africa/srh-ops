import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";
import bcrypt from "bcryptjs";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import { User } from "@/backend/comptes/infrastructure/mongoose/utilisateur.model";
import { POST as resetPassword } from "@/app/api/users/[id]/reset-password/route";
import { PUT as updateUser } from "@/app/api/users/[id]/route";
import { jetons } from "@/backend/comptes/composition";
import { PasswordResetToken } from "@/backend/comptes/infrastructure/mongoose/jeton.model";

const ADMIN_ID = "507f1f77bcf86cd799439011";
const OLD_PASSWORD = "OldPassw0rd!";

function mockSession(role: string, extra: Record<string, unknown> = {}) {
  vi.mocked(nextAuth.getServerSession).mockResolvedValue({
    user: {
      id: ADMIN_ID,
      name: "Session User",
      email: "session@srh.ci",
      username: "session_user",
      role,
      ...extra,
    },
  } as never);
}

function callReset(id: string) {
  return resetPassword(
    new NextRequest(`http://localhost:3000/api/users/${id}/reset-password`, { method: "POST" }),
    { params: Promise.resolve({ id }) }
  );
}

async function seedTarget(suffix: string) {
  await connectDB();
  return User.create({
    username: `target_${suffix}`,
    nom: `Target ${suffix}`,
    email: `target_${suffix}@srh.ci`,
    motDePasseHash: await bcrypt.hash(OLD_PASSWORD, 10),
    role: "dispatcher",
    mustChangePassword: false,
  });
}

describe("POST /api/users/[id]/reset-password (régénération par un administrateur)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSession("admin");
  });

  it("admin : régénère le mot de passe, invalide l'ancien et force le changement", async () => {
    const target = await seedTarget("ok");
    const before = target.motDePasseHash;

    const res = await callReset(String(target._id));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const data = await res.json();
    expect(typeof data.generatedPassword).toBe("string");
    expect(data.generatedPassword.length).toBeGreaterThanOrEqual(8);
    expect(data.message ?? "").not.toContain(data.generatedPassword);
    expect(data.motDePasseHash).toBeUndefined();

    const after = (await User.findById(target._id))!;
    expect(after.motDePasseHash).not.toBe(before);
    expect(await bcrypt.compare(OLD_PASSWORD, after.motDePasseHash)).toBe(false);
    expect(await bcrypt.compare(data.generatedPassword, after.motDePasseHash)).toBe(true);
    expect(after.mustChangePassword).toBe(true);
  });

  it("admin : renseigne passwordChangedAt (les sessions ouvertes seront invalidées)", async () => {
    const target = await seedTarget("changedat");
    expect(target.passwordChangedAt).toBeUndefined();

    const startedAt = Date.now();
    const res = await callReset(String(target._id));
    expect(res.status).toBe(200);

    const after = (await User.findById(target._id))!;
    expect(after.passwordChangedAt).toBeInstanceOf(Date);
    expect(after.passwordChangedAt!.getTime()).toBeGreaterThanOrEqual(startedAt);
    expect(after.passwordChangedAt!.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("admin : peut régénérer le mot de passe d'un autre administrateur et le sien", async () => {
    await connectDB();
    const otherAdmin = await User.create({
      username: "other_admin",
      nom: "Other Admin",
      email: "other_admin@srh.ci",
      motDePasseHash: await bcrypt.hash(OLD_PASSWORD, 10),
      role: "admin",
    });
    const res = await callReset(String(otherAdmin._id));
    expect(res.status).toBe(200);

    // Soi-même (l'id de session correspond à l'utilisateur ciblé)
    mockSession("admin", { id: String(otherAdmin._id) });
    const resSelf = await callReset(String(otherAdmin._id));
    expect(resSelf.status).toBe(200);
  });

  it.each(["dispatcher", "lecture", "chauffeur", "client"])(
    "%s : refusé (403) et hash inchangé",
    async (role) => {
      const target = await seedTarget(`forbid_${role}`);
      const before = target.motDePasseHash;

      mockSession(role, { clientId: "507f1f77bcf86cd799439099" });
      const res = await callReset(String(target._id));
      expect(res.status).toBe(403);

      const after = (await User.findById(target._id))!;
      expect(after.motDePasseHash).toBe(before);
      expect(after.mustChangePassword).toBe(false);
    }
  );

  it("non authentifié : 401 et hash inchangé", async () => {
    const target = await seedTarget("anon");
    const before = target.motDePasseHash;

    vi.mocked(nextAuth.getServerSession).mockResolvedValue(null as never);
    const res = await callReset(String(target._id));
    expect(res.status).toBe(401);

    const after = (await User.findById(target._id))!;
    expect(after.motDePasseHash).toBe(before);
  });

  it("identifiant mal formé : 400", async () => {
    const res = await callReset("pas-un-objectid");
    expect(res.status).toBe(400);
  });

  it("utilisateur inconnu : 404", async () => {
    const res = await callReset("507f1f77bcf86cd7994390ff");
    expect(res.status).toBe(404);
  });

  it("ne journalise jamais le mot de passe généré", async () => {
    const target = await seedTarget("log");
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {})
    );

    try {
      const res = await callReset(String(target._id));
      expect(res.status).toBe(200);
      const { generatedPassword } = await res.json();

      const consoleOutput = spies
        .flatMap((spy) => spy.mock.calls)
        .flat()
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join("\n");
      expect(consoleOutput).not.toContain(generatedPassword);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });

  it("admin : la régénération révoque les liens en attente (invitation comprise)", async () => {
    const target = await seedTarget("revoke");
    const { token } = await jetons.emettre(String(target._id), "invitation", new Date());

    const res = await callReset(String(target._id));
    expect(res.status).toBe(200);

    expect(await jetons.consommer(token, new Date())).toBeNull();
    expect(await PasswordResetToken.countDocuments({ userId: target._id, usedAt: null })).toBe(0);
  });

  it("utilisateur inconnu : 404 et aucun jeton d'un autre compte n'est touché", async () => {
    const other = await seedTarget("other");
    await jetons.emettre(String(other._id), "invitation", new Date());

    const res = await callReset("507f1f77bcf86cd7994390ff");
    expect(res.status).toBe(404);
    expect(await PasswordResetToken.countDocuments({ userId: other._id, usedAt: null })).toBe(1);
  });
});

describe("PUT /api/users/[id] : changement d'e-mail et liens en attente", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSession("admin");
  });

  const callUpdate = (id: string, email: string) =>
    updateUser(
      new NextRequest(`http://localhost:3000/api/users/${id}`, {
        method: "PUT",
        body: JSON.stringify({ nom: "Target", email, role: "dispatcher", telephone: "" }),
      }),
      { params: Promise.resolve({ id }) }
    );

  it("e-mail modifié : les liens envoyés à l'ancienne adresse sont révoqués", async () => {
    const target = await seedTarget("mail1");
    const { token } = await jetons.emettre(String(target._id), "invitation", new Date());

    const res = await callUpdate(String(target._id), "nouvelle.adresse@srh.ci");
    expect(res.status).toBe(200);

    expect(await jetons.consommer(token, new Date())).toBeNull();
    expect(await PasswordResetToken.countDocuments({ userId: target._id, usedAt: null })).toBe(0);
  });

  it("e-mail identique (casse différente) : les liens en attente sont conservés", async () => {
    const target = await seedTarget("mail2");
    const { token } = await jetons.emettre(String(target._id), "invitation", new Date());

    const res = await callUpdate(String(target._id), target.email.toUpperCase());
    expect(res.status).toBe(200);

    expect(await PasswordResetToken.countDocuments({ userId: target._id, usedAt: null })).toBe(1);
    expect(await jetons.consommer(token, new Date())).toEqual({ userId: String(target._id), finalite: "invitation" });
  });
});
