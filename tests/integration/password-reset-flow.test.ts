import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

import { POST as forgot } from "@/app/api/auth/forgot-password/route";
import { POST as reset } from "@/app/api/auth/reset-password/route";
import * as rateLimit from "@/lib/rate-limit";
import { getMemoryTransport } from "@/lib/mail";
import { User } from "@/models/User";
import { PasswordResetToken } from "@/models/PasswordResetToken";

const OLD = "AncienMdp1";
const NEW = "NouveauMdp2";
const GENERIC_MESSAGE =
  "Si un compte correspond à cet identifiant, un e-mail de réinitialisation vient d'être envoyé.";

function post(url: string, body: unknown, ip = "203.0.113.10") {
  return new NextRequest(`http://localhost:3000${url}`, {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

async function seedUser(extra: Record<string, unknown> = {}) {
  return User.create({
    username: "awa", nom: "Awa", email: "awa@srh.ci",
    motDePasseHash: await bcrypt.hash(OLD, 10), role: "dispatcher", ...extra,
  });
}

function tokenFromMail(): string {
  const text = getMemoryTransport().sent.at(-1)!.text;
  const match = text.match(/reset-password\?token=([A-Za-z0-9_-]{43})/);
  expect(match).not.toBeNull();
  return match![1];
}

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getMemoryTransport().reset();
    process.env.NEXTAUTH_URL = "https://ops.srh.ci";
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("compte existant : e-mail envoyé avec un lien à jeton, mot de passe intact", async () => {
    const user = await seedUser();
    const res = await forgot(post("/api/auth/forgot-password", { identifier: "awa@srh.ci" }));

    expect(res.status).toBe(200);
    expect(getMemoryTransport().sent).toHaveLength(1);
    expect(getMemoryTransport().sent[0].to).toBe("awa@srh.ci");
    expect(getMemoryTransport().sent[0].text).toContain("https://ops.srh.ci/reset-password?token=");
    const after = await User.findById(user._id);
    expect(after?.motDePasseHash).toBe(user.motDePasseHash);
    expect(await PasswordResetToken.countDocuments({ userId: user._id })).toBe(1);
  });

  it("l'identifiant peut être le nom d'utilisateur", async () => {
    await seedUser();
    await forgot(post("/api/auth/forgot-password", { identifier: "AWA" }));
    expect(getMemoryTransport().sent).toHaveLength(1);
  });

  it("compte inexistant : réponse strictement identique, aucun e-mail, aucun jeton", async () => {
    await seedUser();
    const known = await forgot(post("/api/auth/forgot-password", { identifier: "awa@srh.ci" }, "198.51.100.1"));
    getMemoryTransport().reset();
    const unknown = await forgot(post("/api/auth/forgot-password", { identifier: "inconnu@srh.ci" }, "198.51.100.2"));

    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
    expect(getMemoryTransport().sent).toHaveLength(0);
    expect(await PasswordResetToken.countDocuments()).toBe(1); // celui du compte connu seulement
  });

  it("échec d'envoi : la réponse reste identique (pas de fuite)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await seedUser();
    getMemoryTransport().failNext();
    const res = await forgot(post("/api/auth/forgot-password", { identifier: "awa@srh.ci" }));
    expect(res.status).toBe(200);
  });

  it("identifiant absent : 400", async () => {
    const res = await forgot(post("/api/auth/forgot-password", {}));
    expect(res.status).toBe(400);
  });

  it("limite : 5 demandes par heure et par identifiant, puis 429 avec Retry-After", async () => {
    await seedUser();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await forgot(post("/api/auth/forgot-password", { identifier: "awa@srh.ci" }, `192.0.2.${i}`))).status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    const blocked = await forgot(post("/api/auth/forgot-password", { identifier: "awa@srh.ci" }, "192.0.2.99"));
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });

  it("limite : 10 demandes par heure et par IP, quel que soit l'identifiant", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push((await forgot(post("/api/auth/forgot-password", { identifier: `user${i}@srh.ci` }, "203.0.113.50"))).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("limiteur en panne : réponse générique 200 identique, aucun e-mail, seul le nom de l'erreur est journalisé", async () => {
    await seedUser();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(rateLimit, "consumeRateLimit").mockRejectedValue(new Error("connexion mongodb://secret@hote"));

    const known = await forgot(post("/api/auth/forgot-password", { identifier: "awa@srh.ci" }));
    const unknown = await forgot(post("/api/auth/forgot-password", { identifier: "inconnu@srh.ci" }));

    for (const res of [known, unknown]) {
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ message: GENERIC_MESSAGE });
    }
    expect(getMemoryTransport().sent).toHaveLength(0);
    expect(await PasswordResetToken.countDocuments()).toBe(0);

    const logged = errorSpy.mock.calls.flat().map(String).join("\n");
    expect(logged).not.toContain("mongodb://");
    expect(logged).not.toContain("awa@srh.ci");
  });

  it("ne journalise jamais le jeton, le lien ni l'adresse e-mail", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {})
    );
    await seedUser();
    await forgot(post("/api/auth/forgot-password", { identifier: "awa@srh.ci" }));
    const token = tokenFromMail();
    await reset(post("/api/auth/reset-password", { token, newPassword: NEW }));

    const output = spies
      .flatMap((spy) => spy.mock.calls)
      .flat()
      .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
      .join("\n");
    expect(output).not.toContain(token);
    expect(output).not.toContain("awa@srh.ci");
    expect(output).not.toContain(NEW);
  });
});

describe("POST /api/auth/reset-password", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getMemoryTransport().reset();
    process.env.NEXTAUTH_URL = "https://ops.srh.ci";
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function requestToken() {
    const user = await seedUser({ mustChangePassword: true });
    await forgot(post("/api/auth/forgot-password", { identifier: "awa@srh.ci" }));
    return { user, token: tokenFromMail() };
  }

  it("un jeton valide change le mot de passe, lève le drapeau, invalide les sessions et prévient par e-mail", async () => {
    const { user, token } = await requestToken();
    getMemoryTransport().reset();

    const res = await reset(post("/api/auth/reset-password", { token, newPassword: NEW }));
    expect(res.status).toBe(200);

    const after = await User.findById(user._id);
    expect(await bcrypt.compare(NEW, after!.motDePasseHash)).toBe(true);
    expect(await bcrypt.compare(OLD, after!.motDePasseHash)).toBe(false);
    expect(after?.mustChangePassword).toBe(false);
    expect(after?.passwordChangedAt).toBeInstanceOf(Date);

    const notice = getMemoryTransport().sent;
    expect(notice).toHaveLength(1);
    expect(notice[0].subject).toContain("modifié");
    expect(notice[0].text).not.toContain(NEW);
  });

  it("le jeton ne sert qu'une fois : le second essai est refusé et le mot de passe reste celui du premier", async () => {
    const { user, token } = await requestToken();
    expect((await reset(post("/api/auth/reset-password", { token, newPassword: NEW }))).status).toBe(200);

    const second = await reset(post("/api/auth/reset-password", { token, newPassword: "Autre3Mdp" }));
    expect(second.status).toBe(400);
    expect((await second.json()).error).toBe("Lien invalide ou expiré. Demandez un nouveau lien.");
    const after = await User.findById(user._id);
    expect(await bcrypt.compare(NEW, after!.motDePasseHash)).toBe(true);
  });

  it("jeton inconnu, mal formé ou expiré : 400 identique, mot de passe intact", async () => {
    const { user, token } = await requestToken();
    await PasswordResetToken.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    for (const bad of [token, "x".repeat(43), "court", ""]) {
      const res = await reset(post("/api/auth/reset-password", { token: bad, newPassword: NEW }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Lien invalide ou expiré. Demandez un nouveau lien.");
    }
    expect((await User.findById(user._id))?.motDePasseHash).toBe(user.motDePasseHash);
  });

  it("mot de passe trop court : 400 et le jeton n'est PAS consommé", async () => {
    const { token } = await requestToken();
    const short = await reset(post("/api/auth/reset-password", { token, newPassword: "abc" }));
    expect(short.status).toBe(400);
    const ok = await reset(post("/api/auth/reset-password", { token, newPassword: NEW }));
    expect(ok.status).toBe(200);
  });

  it("limite : 20 tentatives par heure et par IP", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      statuses.push((await reset(post("/api/auth/reset-password", { token: "x".repeat(43), newPassword: NEW }, "203.0.113.77"))).status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 400)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  it("limiteur en panne : échec fermé, 503 générique, mot de passe intact et jeton non consommé", async () => {
    const { user, token } = await requestToken();
    vi.spyOn(rateLimit, "consumeRateLimit").mockRejectedValue(new Error("boom"));

    const res = await reset(post("/api/auth/reset-password", { token, newPassword: NEW }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Service momentanément indisponible. Réessayez plus tard." });
    expect((await User.findById(user._id))?.motDePasseHash).toBe(user.motDePasseHash);

    vi.restoreAllMocks();
    const retry = await reset(post("/api/auth/reset-password", { token, newPassword: NEW }));
    expect(retry.status).toBe(200);
  });
});
