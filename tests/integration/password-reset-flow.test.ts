import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

import { POST as forgot } from "@/app/api/auth/forgot-password/route";
import { POST as reset } from "@/app/api/auth/reset-password/route";
import * as rateLimit from "@/backend/platform/limiteur-debit/rate-limit";
import * as resetToken from "@/lib/auth/reset-token";
import { getMemoryTransport } from "@/backend/platform/email";
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

  it("NEXTAUTH_URL absent : le jeton précédent reste utilisable, rien n'est envoyé, réponse toujours générique", async () => {
    const user = await seedUser();
    const previous = await resetToken.issueResetToken(String(user._id), "reset");
    vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.NEXTAUTH_URL;

    const res = await forgot(post("/api/auth/forgot-password", { identifier: "awa@srh.ci" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: GENERIC_MESSAGE });
    expect(getMemoryTransport().sent).toHaveLength(0);
    expect(await PasswordResetToken.countDocuments({ userId: user._id, usedAt: null })).toBe(1);
    expect(await resetToken.consumeResetToken(previous.token)).toEqual({ userId: String(user._id), purpose: "reset" });
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

  it("choisir un mot de passe révoque les autres liens en attente (invitation comprise), le jeton consommé reste tracé", async () => {
    const user = await seedUser({ mustChangePassword: true });
    const userId = String(user._id);
    const invitation = await resetToken.issueResetToken(userId, "invitation");
    const resetLink = await resetToken.issueResetToken(userId, "reset");
    expect(await PasswordResetToken.countDocuments({ userId, usedAt: null })).toBe(2);

    const res = await reset(post("/api/auth/reset-password", { token: resetLink.token, newPassword: NEW }));
    expect(res.status).toBe(200);

    expect(await PasswordResetToken.countDocuments({ userId, usedAt: null })).toBe(0);
    expect(await resetToken.consumeResetToken(invitation.token)).toBeNull();
    // Le jeton utilisé reste en base avec usedAt renseigné (traçabilité).
    const used = await PasswordResetToken.find({ userId }).lean<{ tokenHash: string; usedAt: Date | null }[]>();
    expect(used).toHaveLength(1);
    expect(used[0].tokenHash).toBe(resetToken.hashToken(resetLink.token));
    expect(used[0].usedAt).toBeInstanceOf(Date);
    // Le mot de passe choisi par lien ne peut plus être écrasé par l'invitation.
    const retry = await reset(post("/api/auth/reset-password", { token: invitation.token, newPassword: "Pirate3Mdp" }));
    expect(retry.status).toBe(400);
    expect(await bcrypt.compare(NEW, (await User.findById(user._id))!.motDePasseHash)).toBe(true);
  });

  it("l'activation d'une invitation n'envoie pas d'e-mail « mot de passe modifié » ; la réinitialisation, si", async () => {
    const user = await seedUser({ mustChangePassword: true });
    const invitation = await resetToken.issueResetToken(String(user._id), "invitation");
    getMemoryTransport().reset();

    const activation = await reset(post("/api/auth/reset-password", { token: invitation.token, newPassword: NEW }));
    expect(activation.status).toBe(200);
    expect(getMemoryTransport().sent).toHaveLength(0);
    expect(await bcrypt.compare(NEW, (await User.findById(user._id))!.motDePasseHash)).toBe(true);

    const resetLink = await resetToken.issueResetToken(String(user._id), "reset");
    const changed = await reset(post("/api/auth/reset-password", { token: resetLink.token, newPassword: "Autre3Mdp" }));
    expect(changed.status).toBe(200);
    expect(getMemoryTransport().sent).toHaveLength(1);
    expect(getMemoryTransport().sent[0].subject).toContain("modifié");
  });

  it("le jeton ne sert qu'une fois : le second essai est refusé et le mot de passe reste celui du premier", async () => {
    const { user, token } = await requestToken();
    expect((await reset(post("/api/auth/reset-password", { token, newPassword: NEW }))).status).toBe(200);

    const second = await reset(post("/api/auth/reset-password", { token, newPassword: "Autre3Mdp" }));
    expect(second.status).toBe(400);
    const secondBody = await second.json();
    expect(secondBody.error).toBe("Lien invalide ou expiré. Demandez un nouveau lien.");
    expect(secondBody.code).toBe("INVALID_LINK");
    const after = await User.findById(user._id);
    expect(await bcrypt.compare(NEW, after!.motDePasseHash)).toBe(true);
  });

  it("jeton inconnu, mal formé ou expiré : 400 identique, mot de passe intact", async () => {
    const { user, token } = await requestToken();
    await PasswordResetToken.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    for (const bad of [token, "x".repeat(43), "court", ""]) {
      const res = await reset(post("/api/auth/reset-password", { token: bad, newPassword: NEW }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Lien invalide ou expiré. Demandez un nouveau lien.");
      expect(body.code).toBe("INVALID_LINK");
    }
    expect((await User.findById(user._id))?.motDePasseHash).toBe(user.motDePasseHash);
  });

  it("mot de passe trop court : 400 et le jeton n'est PAS consommé", async () => {
    const { token } = await requestToken();
    const short = await reset(post("/api/auth/reset-password", { token, newPassword: "abc" }));
    expect(short.status).toBe(400);
    expect((await short.json()).code).toBeUndefined();
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
    expect(await res.json()).toEqual({ error: "Service momentanément indisponible. Réessayez plus tard ou demandez un nouveau lien." });
    expect((await User.findById(user._id))?.motDePasseHash).toBe(user.motDePasseHash);

    vi.restoreAllMocks();
    const retry = await reset(post("/api/auth/reset-password", { token, newPassword: NEW }));
    expect(retry.status).toBe(200);
  });
});

const INVALID_LINK = "Lien invalide ou expiré. Demandez un nouveau lien.";

function allConsoleOutput(spies: { mock: { calls: unknown[][] } }[]): string {
  return spies
    .flatMap((spy) => spy.mock.calls)
    .flat()
    .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
    .join("\n");
}

describe("bornes de saisie et refus génériques", () => {
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

  it("forgot-password : un identifiant de 300 caractères est refusé (400)", async () => {
    const res = await forgot(post("/api/auth/forgot-password", { identifier: "a".repeat(300) }));
    expect(res.status).toBe(400);
    expect(getMemoryTransport().sent).toHaveLength(0);
  });

  it("forgot-password : un identifiant de 254 caractères reste accepté", async () => {
    const res = await forgot(post("/api/auth/forgot-password", { identifier: "a".repeat(254) }));
    expect(res.status).toBe(200);
  });

  it("reset-password : newPassword absent ou de mauvais type => message français, jeton non consommé", async () => {
    const { token } = await requestToken();
    for (const body of [{ token }, { token, newPassword: 123456 }, { token, newPassword: null }]) {
      const res = await reset(post("/api/auth/reset-password", body));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Le nouveau mot de passe est requis");
    }
    expect((await reset(post("/api/auth/reset-password", { token, newPassword: NEW }))).status).toBe(200);
  });

  it("reset-password : jeton absent, non textuel ou trop long (> 512) => 400 générique", async () => {
    for (const body of [{ newPassword: NEW }, { token: 42, newPassword: NEW }, { token: "x".repeat(600), newPassword: NEW }]) {
      const res = await reset(post("/api/auth/reset-password", body));
      expect(res.status).toBe(400);
      const payload = await res.json();
      expect(payload.error).toBe(INVALID_LINK);
      expect(payload.code).toBe("INVALID_LINK");
    }
  });

  it("reset-password : mot de passe de plus de 128 caractères => 400, jeton non consommé", async () => {
    const { token } = await requestToken();
    const res = await reset(post("/api/auth/reset-password", { token, newPassword: "a".repeat(129) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("128");
    expect((await reset(post("/api/auth/reset-password", { token, newPassword: "a".repeat(128) }))).status).toBe(200);
  });

  it("reset-password : consumeResetToken en échec => 503 générique, rien dans les journaux que le nom d'erreur", async () => {
    const { user, token } = await requestToken();
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {})
    );
    vi.spyOn(resetToken, "consumeResetToken").mockRejectedValueOnce(
      new Error(`mongodb://secret@hote ${token} ${NEW}`)
    );

    const res = await reset(post("/api/auth/reset-password", { token, newPassword: NEW }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Service momentanément indisponible. Réessayez plus tard ou demandez un nouveau lien." });
    expect((await User.findById(user._id))?.motDePasseHash).toBe(user.motDePasseHash);

    const output = allConsoleOutput(spies);
    expect(output).toContain("[reset-password] indisponible");
    for (const secret of [token, NEW, "mongodb://", "awa@srh.ci"]) expect(output).not.toContain(secret);

    // Le jeton n'a pas été consommé : un nouvel essai aboutit.
    expect((await reset(post("/api/auth/reset-password", { token, newPassword: NEW }))).status).toBe(200);
  });

  it("reset-password : une base qui échoue après la consommation du jeton => 503 générique (jamais de 500)", async () => {
    const { token } = await requestToken();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(User, "findByIdAndUpdate").mockImplementationOnce((() => {
      throw new Error("mongodb://secret@hote");
    }) as never);

    const res = await reset(post("/api/auth/reset-password", { token, newPassword: NEW }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).not.toContain("mongodb://");
  });

  it("journaux : échec différé et échec d'envoi journalisent, sans jeton, adresse ni mot de passe", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {})
    );
    await seedUser();

    // 1. échec d'envoi (journalisé par sendMail)
    getMemoryTransport().failNext();
    await forgot(post("/api/auth/forgot-password", { identifier: "awa@srh.ci" }));

    // 2. échec de la tâche différée (journalisé par runAfterResponse), message d'erreur chargé de secrets
    vi.spyOn(resetToken, "issueResetToken").mockRejectedValueOnce(
      new Error(`mongodb://secret@hote awa@srh.ci ${NEW}`)
    );
    await forgot(post("/api/auth/forgot-password", { identifier: "awa@srh.ci" }));

    // 3. parcours réussi : un jeton réel circule
    await forgot(post("/api/auth/forgot-password", { identifier: "awa@srh.ci" }));
    const token = tokenFromMail();
    expect((await reset(post("/api/auth/reset-password", { token, newPassword: NEW }))).status).toBe(200);

    const output = allConsoleOutput(spies);
    expect(output).toContain("[mail] échec d'envoi");
    expect(output).toContain("[after] tâche différée en échec");
    for (const secret of [token, NEW, "awa@srh.ci", "mongodb://", "reset-password?token"]) {
      expect(output).not.toContain(secret);
    }
  });
});
