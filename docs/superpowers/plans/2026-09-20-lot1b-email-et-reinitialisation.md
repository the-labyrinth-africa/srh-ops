# Lot 1B — E-mail SMTP, réinitialisation du mot de passe, invitations : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Envoyer de vrais e-mails depuis `contact@thelabyrinth.africa` (SMTP), rétablir la réinitialisation du mot de passe en libre-service par jeton à usage unique, et inviter les nouveaux utilisateurs par un lien d'activation.

**Architecture:** Une couche `lib/mail/*` isole le transport (SMTP réel, transport mémoire pour les tests) derrière `sendMail(message)` qui ne journalise jamais le corps. Un service de jetons (`lib/auth/reset-token.ts`) stocke uniquement l'empreinte SHA-256 du jeton. Les routes publiques répondent de manière identique que le compte existe ou non (l'envoi est différé avec `after()`), sont limitées en débit par une fenêtre fixe stockée dans MongoDB, et une réinitialisation invalide les sessions existantes.

**Tech Stack:** Next.js 16 (`after` de `next/server`), NextAuth v4 (JWT), Mongoose, Zod, Nodemailer, Vitest + mongodb-memory-server.

**Spec:** `docs/superpowers/plans/2026-09-20-lot1-master.md` (défauts B1, B2 ; tâches 1B.1 à 1B.3) ; paramètres SMTP fournis par le client (ci-dessous).

## Global Constraints

- Le client s'appelle **SRH** ; libellés et e-mails en français ; les e-mails sont signés « L'équipe SRH Ops ».
- Expéditeur : `contact@thelabyrinth.africa`. Serveur sortant : `mail.thelabyrinth.africa` (repli : `mail38.lwspanel.com`), port **465 (SSL)** ou **587 (STARTTLS)**. L'adresse d'expédition doit être celle de la boîte authentifiée.
- Le mot de passe SMTP se renseigne **uniquement** dans `.env.local` (ignoré par Git) et dans les variables d'environnement Vercel (mode Sensitive). Jamais dans Git, dans un test, dans un journal, dans un message d'erreur ni dans le chat.
- Variables : `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` (déjà dans `.env.local.example`), plus `NEXTAUTH_URL` (URL publique, en `https` en production) pour construire les liens.
- Aucun mot de passe, jeton, lien de réinitialisation ni corps d'e-mail dans les logs. Les erreurs de configuration ne citent que les **noms** des variables manquantes, jamais leurs valeurs.
- Les tests n'envoient jamais de vrai e-mail : en environnement de test (`NODE_ENV === "test"`) ou avec `MAIL_TRANSPORT=memory`, le transport est `MemoryTransport`.
- Ne jamais lancer `npm run build`, `npm run seed` ou `scripts/seed-admin.ts` sans `--on-build` contre la base réelle (`.env.local` pointe sur une base réelle) ; ne pas démarrer `next dev`.
- Ne jamais stager `.agents/`, `.claude/`, `skills-lock.json`, `rapports/`, `data/`, `.superpowers/`.
- Refus par défaut et messages génériques sur les routes publiques : pas d'énumération de comptes (ni par le contenu, ni par le code, ni par le temps de réponse).
- État de départ : `main` à `74fc9e1` ; 328 tests verts ; `tsc` propre ; lint 0 erreur (9 avertissements connus).

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `lib/mail/types.ts` (créer) | `MailMessage`, `MailAttachment`, `MailTransport`, `MailResult` |
| `lib/mail/config.ts` (créer) | `readSmtpConfig(env)`, `MailConfigError` |
| `lib/mail/smtp-transport.ts` (créer) | `SmtpTransport` (Nodemailer) |
| `lib/mail/memory-transport.ts` (créer) | `MemoryTransport` pour les tests |
| `lib/mail/index.ts` (créer) | `resolveTransport`, `sendMail`, `getMemoryTransport` |
| `lib/email.ts` (modifier) | Ne garde que `generateRandomPassword` (`sendEmail` factice supprimé) |
| `models/RateLimit.ts`, `lib/rate-limit.ts` (créer) | Limitation de débit à fenêtre fixe, `clientIp` |
| `app/api/mail/test/route.ts` (créer) | Envoi d'un e-mail de test par un administrateur |
| `models/PasswordResetToken.ts`, `lib/auth/reset-token.ts` (créer) | Jetons de réinitialisation et d'invitation |
| `lib/app-url.ts`, `lib/run-after.ts` (créer) | URL publique de l'application ; exécution différée après la réponse |
| `lib/auth/account-mail.ts` (créer) | Gabarits des e-mails de compte |
| `models/User.ts`, `lib/auth-refresh.ts`, `lib/auth.ts` (modifier) | `passwordChangedAt` et invalidation des sessions |
| `app/api/auth/forgot-password/route.ts`, `app/api/auth/reset-password/route.ts` (modifier / créer) | Flux public de réinitialisation |
| `app/forgot-password/page.tsx`, `app/reset-password/**`, `next.config.ts`, `lib/validators/password-form.ts` (modifier / créer) | Pages et en-têtes de sécurité |
| `app/api/users/route.ts`, `app/api/users/[id]/send-reset-link/route.ts`, `components/users/*` (modifier / créer) | Invitation à la création, lien de réinitialisation envoyé par un administrateur |
| `scripts/send-test-mail.ts`, `README.md`, `PLAN.md`, `scripts/generate-progress-report.ts` (créer / modifier) | Test manuel, documentation |

---

### Task 1: Couche d'envoi d'e-mails (SMTP + transport mémoire)

**Files:**
- Create: `lib/mail/types.ts`, `lib/mail/config.ts`, `lib/mail/smtp-transport.ts`, `lib/mail/memory-transport.ts`, `lib/mail/index.ts`
- Modify: `lib/email.ts`, `package.json` / `package-lock.json`
- Test: `tests/unit/mail-config.test.ts`, `tests/unit/mail-transport.test.ts`, `tests/unit/mail-send.test.ts`

**Interfaces:**
- Produces:
  - `MailMessage { to: string; subject: string; text: string; html?: string; attachments?: MailAttachment[] }`, `MailAttachment { filename: string; content: Buffer; contentType: string }`
  - `MailTransport { send(message: MailMessage): Promise<void> }`
  - `type MailResult = { ok: true } | { ok: false; reason: "not_configured" | "send_failed" }`
  - `readSmtpConfig(env): SmtpConfig | null` — `null` si `SMTP_HOST` est absent ou vide ; lève `MailConfigError` (avec `missing: string[]`) si l'hôte est présent mais la configuration est incomplète ou invalide.
  - `SmtpTransport` — `new SmtpTransport(transporter, from)` et `SmtpTransport.fromConfig(config)`.
  - `MemoryTransport` — `sent: MailMessage[]`, `failNext(): void`, `reset(): void`.
  - `resolveTransport(env?): MailTransport | null`, `sendMail(message, env?): Promise<MailResult>`, `getMemoryTransport(): MemoryTransport`.

- [ ] **Step 1: Installer Nodemailer**

Run: `npm install nodemailer && npm install -D @types/nodemailer`
Expected: `package.json` gagne `nodemailer` (dependencies) et `@types/nodemailer` (devDependencies). Ne pas lancer `npm run build`.

- [ ] **Step 2: Écrire les tests qui échouent**

```ts
// tests/unit/mail-config.test.ts
import { describe, it, expect } from "vitest";
import { readSmtpConfig, MailConfigError } from "@/lib/mail/config";

describe("readSmtpConfig", () => {
  it("renvoie null quand SMTP_HOST est absent ou vide", () => {
    expect(readSmtpConfig({})).toBeNull();
    expect(readSmtpConfig({ SMTP_HOST: "  " })).toBeNull();
  });

  it("lit une configuration complète en SSL (465)", () => {
    const config = readSmtpConfig({
      SMTP_HOST: "mail.example.org",
      SMTP_PORT: "465",
      SMTP_USER: "contact@example.org",
      SMTP_PASSWORD: "secret-value",
      MAIL_FROM: "SRH <contact@example.org>",
    });
    expect(config).toEqual({
      host: "mail.example.org",
      port: 465,
      secure: true,
      user: "contact@example.org",
      pass: "secret-value",
      from: "SRH <contact@example.org>",
    });
  });

  it("587 : STARTTLS (secure=false) sauf SMTP_SECURE=true explicite", () => {
    const base = { SMTP_HOST: "h", SMTP_USER: "u@x.org", SMTP_PASSWORD: "p" };
    expect(readSmtpConfig({ ...base, SMTP_PORT: "587" })?.secure).toBe(false);
    expect(readSmtpConfig({ ...base, SMTP_PORT: "587", SMTP_SECURE: "true" })?.secure).toBe(true);
    expect(readSmtpConfig({ ...base, SMTP_PORT: "465", SMTP_SECURE: "false" })?.secure).toBe(false);
  });

  it("le port vaut 465 par défaut et l'expéditeur retombe sur SRH <SMTP_USER>", () => {
    const config = readSmtpConfig({ SMTP_HOST: "h", SMTP_USER: "u@x.org", SMTP_PASSWORD: "p" });
    expect(config?.port).toBe(465);
    expect(config?.from).toBe("SRH <u@x.org>");
  });

  it("liste les variables manquantes par leur NOM, jamais par leur valeur", () => {
    let error: unknown;
    try {
      readSmtpConfig({ SMTP_HOST: "mail.example.org", SMTP_PASSWORD: "top-secret" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(MailConfigError);
    expect((error as MailConfigError).missing).toEqual(["SMTP_USER"]);
    expect((error as Error).message).toContain("SMTP_USER");
    expect((error as Error).message).not.toContain("top-secret");
    expect((error as Error).message).not.toContain("mail.example.org");
  });

  it("refuse un port invalide", () => {
    expect(() =>
      readSmtpConfig({ SMTP_HOST: "h", SMTP_USER: "u@x.org", SMTP_PASSWORD: "p", SMTP_PORT: "abc" })
    ).toThrow(MailConfigError);
    expect(() =>
      readSmtpConfig({ SMTP_HOST: "h", SMTP_USER: "u@x.org", SMTP_PASSWORD: "p", SMTP_PORT: "70000" })
    ).toThrow(MailConfigError);
  });
});
```

```ts
// tests/unit/mail-transport.test.ts
import { describe, it, expect } from "vitest";
import nodemailer from "nodemailer";
import { SmtpTransport } from "@/lib/mail/smtp-transport";
import { MemoryTransport } from "@/lib/mail/memory-transport";

describe("SmtpTransport", () => {
  it("construit le message avec l'expéditeur configuré, le texte, le html et les pièces jointes", async () => {
    const json = nodemailer.createTransport({ jsonTransport: true });
    const sent: string[] = [];
    const spy = {
      sendMail: async (options: Parameters<typeof json.sendMail>[0]) => {
        const info = await json.sendMail(options);
        sent.push(String((info as { message: string }).message));
        return info;
      },
    };
    const transport = new SmtpTransport(spy as never, "SRH <contact@example.org>");

    await transport.send({
      to: "dest@example.org",
      subject: "Sujet de test",
      text: "Bonjour",
      html: "<p>Bonjour</p>",
      attachments: [{ filename: "rapport.pdf", content: Buffer.from("PDF"), contentType: "application/pdf" }],
    });

    const message = JSON.parse(sent[0]);
    expect(message.from.address).toBe("contact@example.org");
    expect(message.from.name).toBe("SRH");
    expect(message.to[0].address).toBe("dest@example.org");
    expect(message.subject).toBe("Sujet de test");
    expect(message.text).toBe("Bonjour");
    expect(message.html).toBe("<p>Bonjour</p>");
    expect(message.attachments[0].filename).toBe("rapport.pdf");
  });

  it("propage l'échec du transport sous-jacent", async () => {
    const transport = new SmtpTransport(
      { sendMail: async () => { throw new Error("boom"); } } as never,
      "SRH <contact@example.org>"
    );
    await expect(transport.send({ to: "a@b.org", subject: "s", text: "t" })).rejects.toThrow("boom");
  });
});

describe("MemoryTransport", () => {
  it("conserve les messages, et failNext() fait échouer un seul envoi", async () => {
    const memory = new MemoryTransport();
    await memory.send({ to: "a@b.org", subject: "s1", text: "t" });
    memory.failNext();
    await expect(memory.send({ to: "a@b.org", subject: "s2", text: "t" })).rejects.toThrow();
    await memory.send({ to: "a@b.org", subject: "s3", text: "t" });
    expect(memory.sent.map((m) => m.subject)).toEqual(["s1", "s3"]);
    memory.reset();
    expect(memory.sent).toEqual([]);
  });
});
```

```ts
// tests/unit/mail-send.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { sendMail, resolveTransport, getMemoryTransport } from "@/lib/mail";
import { MemoryTransport } from "@/lib/mail/memory-transport";
import { SmtpTransport } from "@/lib/mail/smtp-transport";

const message = { to: "a@b.org", subject: "Sujet secret-free", text: "CORPS-CONFIDENTIEL lien?token=ABC" };

afterEach(() => {
  vi.restoreAllMocks();
  getMemoryTransport().reset();
});

describe("resolveTransport", () => {
  it("utilise le transport mémoire en test ou avec MAIL_TRANSPORT=memory", () => {
    expect(resolveTransport({ NODE_ENV: "test" })).toBeInstanceOf(MemoryTransport);
    expect(resolveTransport({ MAIL_TRANSPORT: "memory" })).toBeInstanceOf(MemoryTransport);
  });
  it("utilise SMTP quand il est configuré", () => {
    const t = resolveTransport({ SMTP_HOST: "h", SMTP_USER: "u@x.org", SMTP_PASSWORD: "p" });
    expect(t).toBeInstanceOf(SmtpTransport);
  });
  it("renvoie null quand rien n'est configuré", () => {
    expect(resolveTransport({})).toBeNull();
  });
});

describe("sendMail", () => {
  it("renvoie ok et enregistre le message dans le transport mémoire", async () => {
    const result = await sendMail(message);
    expect(result).toEqual({ ok: true });
    expect(getMemoryTransport().sent).toHaveLength(1);
  });

  it("renvoie not_configured sans lever quand aucun transport n'est configuré", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await sendMail(message, {})).toEqual({ ok: false, reason: "not_configured" });
  });

  it("renvoie not_configured sur une configuration incomplète", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendMail(message, { SMTP_HOST: "h" })).toEqual({ ok: false, reason: "not_configured" });
  });

  it("renvoie send_failed sur un échec d'envoi", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getMemoryTransport().failNext();
    expect(await sendMail(message)).toEqual({ ok: false, reason: "send_failed" });
  });

  it("ne journalise jamais le corps du message ni le destinataire", async () => {
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "info").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
    ];
    getMemoryTransport().failNext();
    await sendMail(message);
    await sendMail(message, {});
    const output = spies.flatMap((s) => s.mock.calls).flat().map(String).join("\n");
    expect(output).not.toContain("CORPS-CONFIDENTIEL");
    expect(output).not.toContain("token=ABC");
    expect(output).not.toContain("a@b.org");
  });
});
```

- [ ] **Step 3: Lancer** — `npx vitest run tests/unit/mail-config.test.ts tests/unit/mail-transport.test.ts tests/unit/mail-send.test.ts` → FAIL (modules absents).

- [ ] **Step 4: Implémenter**

```ts
// lib/mail/types.ts
export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

export type MailResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "send_failed" };
```

```ts
// lib/mail/config.ts
export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

/** Ne contient que des NOMS de variables : jamais leurs valeurs. */
export class MailConfigError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Configuration SMTP incomplète ou invalide : ${missing.join(", ")}`);
    this.name = "MailConfigError";
  }
}

type Env = Record<string, string | undefined>;

/**
 * null  → SMTP non configuré (SMTP_HOST absent ou vide) ;
 * lève MailConfigError si l'hôte est renseigné mais que le reste est incomplet.
 */
export function readSmtpConfig(env: Env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  if (!host) return null;

  const missing: string[] = [];
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASSWORD;
  if (!user) missing.push("SMTP_USER");
  if (!pass) missing.push("SMTP_PASSWORD");

  const rawPort = env.SMTP_PORT?.trim();
  const port = rawPort ? Number(rawPort) : 465;
  if (!Number.isInteger(port) || port < 1 || port > 65535) missing.push("SMTP_PORT");

  if (missing.length > 0) throw new MailConfigError(missing);

  const secure =
    env.SMTP_SECURE === "true" ? true : env.SMTP_SECURE === "false" ? false : port === 465;

  return {
    host,
    port,
    secure,
    user: user as string,
    pass: pass as string,
    from: env.MAIL_FROM?.trim() || `SRH <${user}>`,
  };
}
```

```ts
// lib/mail/smtp-transport.ts
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { SmtpConfig } from "@/lib/mail/config";
import type { MailMessage, MailTransport } from "@/lib/mail/types";

export class SmtpTransport implements MailTransport {
  constructor(
    private readonly transporter: Pick<Transporter, "sendMail">,
    private readonly from: string
  ) {}

  static fromConfig(config: SmtpConfig): SmtpTransport {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: !config.secure,
      auth: { user: config.user, pass: config.pass },
      // Une fonction serverless ne doit jamais rester suspendue sur un serveur muet.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    return new SmtpTransport(transporter, config.from);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
  }
}
```

```ts
// lib/mail/memory-transport.ts
import type { MailMessage, MailTransport } from "@/lib/mail/types";

/** Transport des tests : conserve les messages en mémoire, n'envoie rien. */
export class MemoryTransport implements MailTransport {
  sent: MailMessage[] = [];
  private failures = 0;

  async send(message: MailMessage): Promise<void> {
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error("Échec d'envoi simulé");
    }
    this.sent.push(message);
  }

  /** Fait échouer le prochain envoi (un seul). */
  failNext(): void {
    this.failures += 1;
  }

  reset(): void {
    this.sent = [];
    this.failures = 0;
  }
}
```

```ts
// lib/mail/index.ts
import { MailConfigError, readSmtpConfig } from "@/lib/mail/config";
import { MemoryTransport } from "@/lib/mail/memory-transport";
import { SmtpTransport } from "@/lib/mail/smtp-transport";
import type { MailMessage, MailResult, MailTransport } from "@/lib/mail/types";

type Env = Record<string, string | undefined>;

let memory: MemoryTransport | undefined;

export function getMemoryTransport(): MemoryTransport {
  memory ??= new MemoryTransport();
  return memory;
}

/** null → aucun transport configuré. Lève MailConfigError si SMTP est mal configuré. */
export function resolveTransport(env: Env = process.env): MailTransport | null {
  if (env.MAIL_TRANSPORT === "memory" || env.NODE_ENV === "test") return getMemoryTransport();
  const config = readSmtpConfig(env);
  return config ? SmtpTransport.fromConfig(config) : null;
}

/**
 * Envoie un e-mail sans jamais lever ni journaliser son contenu (corps, lien,
 * destinataire) : seuls l'objet et la nature de l'échec sont tracés.
 */
export async function sendMail(message: MailMessage, env: Env = process.env): Promise<MailResult> {
  let transport: MailTransport | null;
  try {
    transport = resolveTransport(env);
  } catch (error) {
    console.error(
      "[mail] configuration invalide :",
      error instanceof MailConfigError ? error.message : "erreur inconnue"
    );
    return { ok: false, reason: "not_configured" };
  }

  if (!transport) {
    console.warn(`[mail] aucun transport configuré : « ${message.subject} » non envoyé`);
    return { ok: false, reason: "not_configured" };
  }

  try {
    await transport.send(message);
    return { ok: true };
  } catch (error) {
    console.error(
      `[mail] échec d'envoi de « ${message.subject} » :`,
      error instanceof Error ? error.name : "erreur inconnue"
    );
    return { ok: false, reason: "send_failed" };
  }
}
```

`lib/email.ts` : supprimer `SendEmailOptions` et `sendEmail` (plus utilisés — vérifier avec `grep -rn "sendEmail" app components lib scripts tests`) ; ne garder que `generateRandomPassword`. Supprimer les tests qui n'existent plus, le cas échéant, en le signalant dans le rapport.

- [ ] **Step 5: Relancer** — les trois fichiers → PASS ; puis `npx tsc --noEmit && npm run lint && npx vitest run` → tout vert.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/mail lib/email.ts tests/unit/mail-config.test.ts tests/unit/mail-transport.test.ts tests/unit/mail-send.test.ts
git commit -m "feat(mail): couche d'envoi SMTP (Nodemailer) avec transport mémoire pour les tests"
```

---

### Task 2: Limitation de débit stockée en base

**Files:**
- Create: `models/RateLimit.ts`, `lib/rate-limit.ts`
- Test: `tests/integration/rate-limit.test.ts`

**Interfaces:**
- Produces:
  - `consumeRateLimit(scope: string, id: string, opts: { limit: number; windowMs: number }, now?: number): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }>` — fenêtre fixe ; l'identifiant est **haché** (SHA-256) avant stockage.
  - `clientIp(req: Request): string` — premier saut de `x-forwarded-for`, sinon `"unknown"`.

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// tests/integration/rate-limit.test.ts
import { describe, it, expect } from "vitest";
import { consumeRateLimit, clientIp } from "@/lib/rate-limit";
import { RateLimit } from "@/models/RateLimit";

const HOUR = 3_600_000;
const opts = { limit: 3, windowMs: HOUR };

describe("consumeRateLimit", () => {
  it("autorise jusqu'à la limite puis refuse, avec remaining et retryAfter", async () => {
    const now = Date.UTC(2026, 8, 20, 10, 0, 0);
    const r1 = await consumeRateLimit("t", "a", opts, now);
    const r2 = await consumeRateLimit("t", "a", opts, now);
    const r3 = await consumeRateLimit("t", "a", opts, now);
    const r4 = await consumeRateLimit("t", "a", opts, now);

    expect([r1.allowed, r2.allowed, r3.allowed, r4.allowed]).toEqual([true, true, true, false]);
    expect([r1.remaining, r2.remaining, r3.remaining, r4.remaining]).toEqual([2, 1, 0, 0]);
    expect(r4.retryAfterSeconds).toBe(3600);
  });

  it("les clés (portée, identifiant) sont indépendantes", async () => {
    const now = Date.UTC(2026, 8, 20, 10, 0, 0);
    for (let i = 0; i < 3; i++) await consumeRateLimit("t", "a", opts, now);
    expect((await consumeRateLimit("t", "a", opts, now)).allowed).toBe(false);
    expect((await consumeRateLimit("t", "b", opts, now)).allowed).toBe(true);
    expect((await consumeRateLimit("autre", "a", opts, now)).allowed).toBe(true);
  });

  it("repart à zéro dans la fenêtre suivante", async () => {
    const now = Date.UTC(2026, 8, 20, 10, 0, 0);
    for (let i = 0; i < 4; i++) await consumeRateLimit("t", "a", opts, now);
    expect((await consumeRateLimit("t", "a", opts, now + HOUR)).allowed).toBe(true);
  });

  it("est atomique : 10 appels concurrents, limite 5 → exactement 5 autorisés", async () => {
    const now = Date.UTC(2026, 8, 20, 10, 0, 0);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => consumeRateLimit("c", "x", { limit: 5, windowMs: HOUR }, now))
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });

  it("ne stocke pas l'identifiant en clair", async () => {
    await consumeRateLimit("t", "victime@example.org", opts);
    const docs = await RateLimit.find().lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].key).not.toContain("victime");
    expect(docs[0].key).not.toContain("example.org");
    expect(docs[0].expiresAt).toBeInstanceOf(Date);
  });

  it("insensible à la casse de l'identifiant", async () => {
    const now = Date.UTC(2026, 8, 20, 10, 0, 0);
    for (let i = 0; i < 3; i++) await consumeRateLimit("t", "Alice@X.org", opts, now);
    expect((await consumeRateLimit("t", "alice@x.org", opts, now)).allowed).toBe(false);
  });
});

describe("clientIp", () => {
  const req = (headers: Record<string, string>) =>
    new Request("http://localhost/x", { headers });
  it("prend le premier saut de x-forwarded-for", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });
  it("renvoie unknown sans en-tête", () => {
    expect(clientIp(req({}))).toBe("unknown");
  });
});
```

- [ ] **Step 2: Lancer** — `npx vitest run tests/integration/rate-limit.test.ts` → FAIL.

- [ ] **Step 3: Implémenter**

```ts
// models/RateLimit.ts
import { Schema, models, model } from "mongoose";

export interface IRateLimit {
  key: string;
  count: number;
  expiresAt: Date;
}

const RateLimitSchema = new Schema<IRateLimit>({
  key: { type: String, required: true, unique: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
});

// Suppression automatique des fenêtres échues.
RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimit = models.RateLimit || model<IRateLimit>("RateLimit", RateLimitSchema);
```

```ts
// lib/rate-limit.ts
import { createHash } from "node:crypto";
import { connectDB } from "@/lib/db";
import { RateLimit } from "@/models/RateLimit";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

function hashId(id: string): string {
  return createHash("sha256").update(id.trim().toLowerCase()).digest("hex").slice(0, 32);
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}

/**
 * Fenêtre fixe : au plus `limit` appels par `windowMs` et par (portée, identifiant).
 * Un salve à cheval sur deux fenêtres peut atteindre 2 × limit : acceptable ici.
 */
export async function consumeRateLimit(
  scope: string,
  id: string,
  opts: { limit: number; windowMs: number },
  now: number = Date.now()
): Promise<RateLimitResult> {
  await connectDB();

  const windowStart = Math.floor(now / opts.windowMs) * opts.windowMs;
  const windowEnd = windowStart + opts.windowMs;
  const key = `${scope}:${hashId(id)}:${windowStart}`;

  let count = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const doc = await RateLimit.findOneAndUpdate(
        { key },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowEnd) } },
        { upsert: true, new: true }
      );
      count = doc.count;
      break;
    } catch (error) {
      // Deux premières insertions concurrentes : la seconde échoue sur l'index unique, on réessaie.
      if (!isDuplicateKey(error) || attempt === 1) throw error;
    }
  }

  return {
    allowed: count <= opts.limit,
    remaining: Math.max(0, opts.limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((windowEnd - now) / 1000)),
  };
}

/** Adresse du client : premier saut de x-forwarded-for (posé par la plateforme). */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || "unknown";
}
```

- [ ] **Step 4: Relancer** — PASS ; `npx tsc --noEmit && npm run lint && npx vitest run`.

- [ ] **Step 5: Commit**

```bash
git add models/RateLimit.ts lib/rate-limit.ts tests/integration/rate-limit.test.ts
git commit -m "feat(securite): limitation de débit à fenêtre fixe stockée en base"
```

---

### Task 3: E-mail de test pour l'administrateur

**Files:**
- Create: `app/api/mail/test/route.ts`
- Modify: `components/profil/ProfilPageClient.tsx` (bouton réservé à l'administrateur)
- Test: `tests/integration/mail-test-route.test.ts`

**Interfaces:**
- Consumes: `sendMail`, `getMemoryTransport` (Task 1), `consumeRateLimit` (Task 2), `requireAuth` (`lib/api-auth.ts`).
- Produces: `POST /api/mail/test` → `200 { ok: true }` ou `502 { ok: false, reason }` ; `403` hors administrateur ; `429` au-delà de 5 envois par heure et par administrateur. Le destinataire est **toujours l'adresse du compte connecté** (lue en base, jamais dans le corps de la requête).

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// tests/integration/mail-test-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { POST as sendTest } from "@/app/api/mail/test/route";
import { getMemoryTransport } from "@/lib/mail";
import { User } from "@/models/User";

function session(role: string, id: string) {
  vi.mocked(nextAuth.getServerSession).mockResolvedValue({
    user: { id, name: "T", email: "session@srh.ci", username: "t", role },
  } as never);
}

const call = () =>
  sendTest(new NextRequest("http://localhost:3000/api/mail/test", { method: "POST" }));

async function seedAdmin() {
  return User.create({
    username: "admin1", nom: "Admin", email: "admin1@srh.ci", motDePasseHash: "x", role: "admin",
  });
}

describe("POST /api/mail/test", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getMemoryTransport().reset();
  });

  it("un administrateur reçoit l'e-mail de test à SON adresse en base", async () => {
    const admin = await seedAdmin();
    session("admin", String(admin._id));

    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const sent = getMemoryTransport().sent;
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("admin1@srh.ci");
    expect(sent[0].subject).toContain("SRH Ops");
  });

  it.each(["dispatcher", "lecture", "chauffeur", "client"])("%s est refusé (403) et rien n'est envoyé", async (role) => {
    const user = await User.create({
      username: `u_${role}`, nom: "U", email: `${role}@srh.ci`, motDePasseHash: "x", role,
      ...(role === "client" ? { clientId: "507f1f77bcf86cd799439011" } : {}),
    });
    session(role, String(user._id));
    const res = await call();
    expect(res.status).toBe(403);
    expect(getMemoryTransport().sent).toHaveLength(0);
  });

  it("renvoie 502 avec la raison quand l'envoi échoue", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const admin = await seedAdmin();
    session("admin", String(admin._id));
    getMemoryTransport().failNext();

    const res = await call();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, reason: "send_failed" });
  });

  it("limite à 5 envois par heure (429 au sixième)", async () => {
    const admin = await seedAdmin();
    session("admin", String(admin._id));
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await call()).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect(getMemoryTransport().sent).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Lancer** → FAIL (route absente).

- [ ] **Step 3: Implémenter**

```ts
// app/api/mail/test/route.ts
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { sendMail } from "@/lib/mail";
import { User } from "@/models/User";

const NO_STORE = { "Cache-Control": "no-store" };

/** Envoie un e-mail de test à l'adresse du compte administrateur connecté. */
export async function POST() {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const limit = await consumeRateLimit("mail-test", auth.user.id, { limit: 5, windowMs: 3_600_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Trop d'e-mails de test. Réessayez plus tard." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  await connectDB();
  const user = await User.findById(auth.user.id).select("email nom").lean();
  if (!user) {
    return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
  }

  const result = await sendMail({
    to: user.email,
    subject: "SRH Ops — e-mail de test",
    text: `Bonjour ${user.nom},\n\nCet e-mail confirme que l'envoi de messages depuis SRH Ops fonctionne.\n\nL'équipe SRH Ops`,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 502, headers: NO_STORE });
}
```

Interface (`components/profil/ProfilPageClient.tsx`) : lire ce composant en entier, puis, **uniquement si `session?.user?.role === "admin"`**, ajouter sous le formulaire de mot de passe une carte « E-mail » avec un bouton « Envoyer un e-mail de test à mon adresse » qui fait `POST /api/mail/test` et affiche : succès « E-mail de test envoyé à votre adresse. » ; `not_configured` « Le service d'e-mail n'est pas configuré (variables SMTP). » ; `send_failed` « L'envoi a échoué : vérifiez les paramètres SMTP. » ; 429 le message renvoyé par l'API (via `formatApiError`). Désactiver le bouton pendant la requête. Pas de test automatique (aucun banc React) : vérification par lecture, `tsc` et lint ; le dire dans le rapport.

- [ ] **Step 4: Relancer** — `npx vitest run tests/integration/mail-test-route.test.ts` → PASS ; puis `npx tsc --noEmit && npm run lint && npx vitest run`.

- [ ] **Step 5: Commit**

```bash
git add app/api/mail components/profil/ProfilPageClient.tsx tests/integration/mail-test-route.test.ts
git commit -m "feat(mail): e-mail de test réservé à l'administrateur, limité à 5 par heure"
```

---

### Task 4: Jetons de réinitialisation et d'invitation

**Files:**
- Create: `models/PasswordResetToken.ts`, `lib/auth/reset-token.ts`
- Test: `tests/integration/reset-token.test.ts`

**Interfaces:**
- Produces:
  - `type TokenPurpose = "reset" | "invitation"` ; durées : `reset` 30 min, `invitation` 72 h.
  - `hashToken(token: string): string` — SHA-256 hexadécimal.
  - `issueResetToken(userId: string, purpose: TokenPurpose, now?: Date): Promise<{ token: string; expiresAt: Date }>` — supprime d'abord les jetons non utilisés de l'utilisateur ; le jeton fait 43 caractères base64url ; **seule l'empreinte est stockée**.
  - `consumeResetToken(token: string, now?: Date): Promise<{ userId: string; purpose: TokenPurpose } | null>` — atomique, à usage unique ; `null` pour un jeton inconnu, mal formé, expiré ou déjà utilisé.

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// tests/integration/reset-token.test.ts
import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { issueResetToken, consumeResetToken, hashToken } from "@/lib/auth/reset-token";
import { PasswordResetToken } from "@/models/PasswordResetToken";

const uid = () => String(new mongoose.Types.ObjectId());
const T0 = new Date(Date.UTC(2026, 8, 20, 10, 0, 0));

describe("issueResetToken", () => {
  it("génère un jeton de 43 caractères et ne stocke que son empreinte", async () => {
    const userId = uid();
    const { token, expiresAt } = await issueResetToken(userId, "reset", T0);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(expiresAt.getTime()).toBe(T0.getTime() + 30 * 60 * 1000);

    const docs = await PasswordResetToken.find().lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].tokenHash).toBe(hashToken(token));
    expect(docs[0].tokenHash).not.toBe(token);
    expect(JSON.stringify(docs[0])).not.toContain(token);
    expect(docs[0].purpose).toBe("reset");
  });

  it("l'invitation vaut 72 heures", async () => {
    const { expiresAt } = await issueResetToken(uid(), "invitation", T0);
    expect(expiresAt.getTime()).toBe(T0.getTime() + 72 * 3600 * 1000);
  });

  it("un nouveau jeton invalide les jetons non utilisés du même utilisateur, pas ceux des autres", async () => {
    const a = uid();
    const b = uid();
    const first = await issueResetToken(a, "reset", T0);
    const other = await issueResetToken(b, "reset", T0);
    const second = await issueResetToken(a, "reset", T0);

    expect(await consumeResetToken(first.token, T0)).toBeNull();
    expect(await consumeResetToken(second.token, T0)).toEqual({ userId: a, purpose: "reset" });
    expect(await consumeResetToken(other.token, T0)).toEqual({ userId: b, purpose: "reset" });
  });
});

describe("consumeResetToken", () => {
  it("ne sert qu'une seule fois", async () => {
    const userId = uid();
    const { token } = await issueResetToken(userId, "reset", T0);
    expect(await consumeResetToken(token, T0)).toEqual({ userId, purpose: "reset" });
    expect(await consumeResetToken(token, T0)).toBeNull();
  });

  it("refuse un jeton expiré (à la milliseconde près)", async () => {
    const { token, expiresAt } = await issueResetToken(uid(), "reset", T0);
    expect(await consumeResetToken(token, new Date(expiresAt.getTime() + 1))).toBeNull();
  });

  it("accepte un jeton juste avant son expiration", async () => {
    const userId = uid();
    const { token, expiresAt } = await issueResetToken(userId, "reset", T0);
    expect(await consumeResetToken(token, new Date(expiresAt.getTime() - 1))).toEqual({ userId, purpose: "reset" });
  });

  it("refuse un jeton inconnu ou mal formé sans lever", async () => {
    expect(await consumeResetToken("", T0)).toBeNull();
    expect(await consumeResetToken("court", T0)).toBeNull();
    expect(await consumeResetToken("a".repeat(43), T0)).toBeNull();
    expect(await consumeResetToken("{$ne:null}".padEnd(43, "x"), T0)).toBeNull();
  });

  it("est atomique : deux consommations concurrentes, une seule réussit", async () => {
    const { token } = await issueResetToken(uid(), "reset", T0);
    const results = await Promise.all([consumeResetToken(token, T0), consumeResetToken(token, T0)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("le jeton utilisé reste en base (traçabilité) avec usedAt renseigné", async () => {
    const { token } = await issueResetToken(uid(), "reset", T0);
    await consumeResetToken(token, T0);
    const doc = await PasswordResetToken.findOne({ tokenHash: hashToken(token) }).lean();
    expect(doc?.usedAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Lancer** → FAIL.

- [ ] **Step 3: Implémenter**

```ts
// models/PasswordResetToken.ts
import mongoose, { Schema, models, model } from "mongoose";

export interface IPasswordResetToken {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  purpose: "reset" | "invitation";
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

const PasswordResetTokenSchema = new Schema<IPasswordResetToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    purpose: { type: String, enum: ["reset", "invitation"], required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Purge automatique 24 h après l'expiration (les jetons utilisés restent visibles jusque-là).
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86_400 });

export const PasswordResetToken =
  models.PasswordResetToken || model<IPasswordResetToken>("PasswordResetToken", PasswordResetTokenSchema);
```

```ts
// lib/auth/reset-token.ts
import { createHash, randomBytes } from "node:crypto";
import { connectDB } from "@/lib/db";
import { PasswordResetToken } from "@/models/PasswordResetToken";

export type TokenPurpose = "reset" | "invitation";

const TTL_MS: Record<TokenPurpose, number> = {
  reset: 30 * 60 * 1000,
  invitation: 72 * 60 * 60 * 1000,
};

// 32 octets encodés en base64url = 43 caractères.
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Émet un jeton à usage unique ; seule son empreinte est conservée. */
export async function issueResetToken(
  userId: string,
  purpose: TokenPurpose,
  now: Date = new Date()
): Promise<{ token: string; expiresAt: Date }> {
  await connectDB();

  // Un seul jeton actif par utilisateur : le précédent (non utilisé) est invalidé.
  await PasswordResetToken.deleteMany({ userId, usedAt: null });

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + TTL_MS[purpose]);
  await PasswordResetToken.create({ userId, tokenHash: hashToken(token), purpose, expiresAt });

  return { token, expiresAt };
}

/** Consomme le jeton (atomique) ; null s'il est inconnu, mal formé, expiré ou déjà utilisé. */
export async function consumeResetToken(
  token: string,
  now: Date = new Date()
): Promise<{ userId: string; purpose: TokenPurpose } | null> {
  if (typeof token !== "string" || !TOKEN_FORMAT.test(token)) return null;

  await connectDB();
  const doc = await PasswordResetToken.findOneAndUpdate(
    { tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { new: true }
  );

  return doc ? { userId: String(doc.userId), purpose: doc.purpose as TokenPurpose } : null;
}
```

- [ ] **Step 4: Relancer** — PASS ; `npx tsc --noEmit && npm run lint && npx vitest run`.

- [ ] **Step 5: Commit**

```bash
git add models/PasswordResetToken.ts lib/auth/reset-token.ts tests/integration/reset-token.test.ts
git commit -m "feat(auth): jetons de réinitialisation et d'invitation à usage unique (empreinte SHA-256)"
```

---

### Task 5: Invalidation des sessions après une réinitialisation

**Files:**
- Modify: `models/User.ts`, `lib/auth.ts`, `lib/auth-refresh.ts`, `app/api/users/[id]/reset-password/route.ts`
- Test: `tests/integration/session-invalidation.test.ts` (nouveau) ; compléter `tests/integration/users-reset-password.test.ts`

**Interfaces:**
- `IUserModel.passwordChangedAt?: Date` — renseigné par une **réinitialisation** (lien ou régénération administrateur), **pas** par un changement volontaire du mot de passe (sinon l'utilisateur serait déconnecté de sa propre session).
- JWT : `issuedAt?: number` (ms) posé à la connexion (`lib/auth.ts`, `declare module "next-auth/jwt"`).
- `refreshTokenFromDb(token)` marque le jeton `invalid: true` si `user.passwordChangedAt` est postérieur à `token.issuedAt` (un jeton sans `issuedAt` est considéré comme antérieur). La relecture a lieu au plus toutes les 5 minutes (`REFRESH_INTERVAL_MS`) : l'invalidation prend donc effet **au plus 5 minutes** après la réinitialisation (à documenter).

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// tests/integration/session-invalidation.test.ts
import { describe, it, expect } from "vitest";
import { refreshTokenFromDb } from "@/lib/auth-refresh";
import { User } from "@/models/User";

async function seed(passwordChangedAt?: Date) {
  return User.create({
    username: "u", nom: "U", email: "u@srh.ci", motDePasseHash: "x", role: "dispatcher",
    ...(passwordChangedAt ? { passwordChangedAt } : {}),
  });
}

const token = (id: string, issuedAt?: number) =>
  ({ id, username: "u", role: "dispatcher", ...(issuedAt !== undefined ? { issuedAt } : {}) } as never);

describe("invalidation des sessions par réinitialisation", () => {
  it("un jeton émis AVANT la réinitialisation devient invalide", async () => {
    const changedAt = new Date(Date.UTC(2026, 8, 20, 12, 0, 0));
    const user = await seed(changedAt);
    const refreshed = await refreshTokenFromDb(token(String(user._id), changedAt.getTime() - 1000));
    expect(refreshed.invalid).toBe(true);
  });

  it("un jeton émis APRÈS la réinitialisation reste valide", async () => {
    const changedAt = new Date(Date.UTC(2026, 8, 20, 12, 0, 0));
    const user = await seed(changedAt);
    const refreshed = await refreshTokenFromDb(token(String(user._id), changedAt.getTime() + 1000));
    expect(refreshed.invalid).toBeFalsy();
  });

  it("sans passwordChangedAt, aucun jeton n'est invalidé (comptes existants)", async () => {
    const user = await seed();
    expect((await refreshTokenFromDb(token(String(user._id)))).invalid).toBeFalsy();
    expect((await refreshTokenFromDb(token(String(user._id), 1))).invalid).toBeFalsy();
  });

  it("un jeton sans issuedAt est considéré comme antérieur à une réinitialisation", async () => {
    const user = await seed(new Date());
    expect((await refreshTokenFromDb(token(String(user._id)))).invalid).toBe(true);
  });
});
```

Ajouter dans `tests/integration/users-reset-password.test.ts` : après une régénération par un administrateur, `User.findById(target)` a `passwordChangedAt` renseigné (Date récente) ; et après `POST /api/auth/change-password` (changement volontaire, dans `must-change-password.test.ts`), `passwordChangedAt` reste **non défini**.

- [ ] **Step 2: Lancer** → FAIL.

- [ ] **Step 3: Implémenter.** `models/User.ts` : ajouter `passwordChangedAt?: Date` à `IUserModel` et `passwordChangedAt: { type: Date }` au schéma. `lib/auth.ts` : ajouter `issuedAt?: number;` au type `JWT` et, dans la branche de première connexion du callback `jwt` (celle qui pose `refreshedAt`), `token.issuedAt = Date.now();`. `lib/auth-refresh.ts` : sélectionner aussi `passwordChangedAt` et, avant de renvoyer le jeton rafraîchi :

```ts
if (user.passwordChangedAt && (token.issuedAt ?? 0) < user.passwordChangedAt.getTime()) {
  return { ...token, invalid: true, refreshedAt: Date.now() };
}
```

`app/api/users/[id]/reset-password/route.ts` : ajouter `passwordChangedAt: new Date()` au `$set` (avec `motDePasseHash` et `mustChangePassword`).

- [ ] **Step 4: Relancer** — les fichiers ci-dessus, puis `npx tsc --noEmit && npm run lint && npx vitest run`.

- [ ] **Step 5: Commit**

```bash
git add models/User.ts lib/auth.ts lib/auth-refresh.ts "app/api/users/[id]/reset-password/route.ts" tests/integration
git commit -m "feat(auth): les sessions ouvertes sont invalidées après une réinitialisation du mot de passe"
```

---

### Task 6: Routes publiques mot de passe oublié / réinitialisation

**Files:**
- Create: `lib/app-url.ts`, `lib/run-after.ts`, `lib/auth/account-mail.ts`, `app/api/auth/reset-password/route.ts`
- Modify: `app/api/auth/forgot-password/route.ts`, tests existants du 503 (`tests/integration/users-auth.test.ts`, lignes ~105-144 — lire le fichier)
- Test: `tests/unit/app-url.test.ts`, `tests/unit/account-mail.test.ts`, `tests/integration/password-reset-flow.test.ts`

**Interfaces:**
- Consumes: `sendMail`, `getMemoryTransport` (Task 1), `consumeRateLimit`, `clientIp` (Task 2), `issueResetToken`, `consumeResetToken` (Task 4), `passwordChangedAt` (Task 5), `forgotPasswordSchema`, `changePasswordSchema` (`lib/validators/user.ts`).
- Produces:
  - `appBaseUrl(env?): string` — `NEXTAUTH_URL` sans slash final ; lève `AppUrlError` s'il manque, et en production s'il n'est pas en `https`.
  - `runAfterResponse(task: () => Promise<void>): Promise<void>` — `after(task)` en contexte de requête (les erreurs de la tâche sont journalisées sans détail) ; hors contexte (tests), exécute la tâche immédiatement.
  - `buildResetMail(user, link)`, `buildInvitationMail(user, link)`, `buildPasswordChangedMail(user)` → `MailMessage` ; `sendResetLinkMail`, `sendInvitationMail`, `sendPasswordChangedMail` (envoient via `sendMail`).
  - `POST /api/auth/forgot-password` → **toujours** `200` avec le même corps `{ message: "Si un compte correspond à cet identifiant, un e-mail de réinitialisation vient d'être envoyé." }` (compte existant ou non), `400` si l'identifiant est absent, `429` (avec `Retry-After`) au-delà de 10 demandes/heure/IP ou 5/heure/identifiant.
  - `POST /api/auth/reset-password` `{ token, newPassword }` → `200 { message }` ; `400 { error: "Lien invalide ou expiré. Demandez un nouveau lien." }` pour tout jeton invalide ; `429` au-delà de 20 tentatives/heure/IP.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// tests/unit/app-url.test.ts
import { describe, it, expect } from "vitest";
import { appBaseUrl, AppUrlError } from "@/lib/app-url";

describe("appBaseUrl", () => {
  it("retire le slash final", () => {
    expect(appBaseUrl({ NEXTAUTH_URL: "https://ops.srh.ci/" })).toBe("https://ops.srh.ci");
  });
  it("accepte http hors production", () => {
    expect(appBaseUrl({ NEXTAUTH_URL: "http://localhost:3000", NODE_ENV: "development" })).toBe("http://localhost:3000");
  });
  it("exige https en production", () => {
    expect(() => appBaseUrl({ NEXTAUTH_URL: "http://ops.srh.ci", NODE_ENV: "production" })).toThrow(AppUrlError);
  });
  it("lève si NEXTAUTH_URL est absent", () => {
    expect(() => appBaseUrl({})).toThrow(AppUrlError);
  });
});
```

```ts
// tests/unit/account-mail.test.ts
import { describe, it, expect } from "vitest";
import { buildResetMail, buildInvitationMail, buildPasswordChangedMail } from "@/lib/auth/account-mail";

const user = { nom: "Awa Koné", email: "awa@srh.ci" };
const link = "https://ops.srh.ci/reset-password?token=TOKEN123";

describe("gabarits d'e-mails de compte", () => {
  it("réinitialisation : destinataire, lien, durée de validité, aucun mot de passe", () => {
    const m = buildResetMail(user, link);
    expect(m.to).toBe("awa@srh.ci");
    expect(m.subject).toContain("SRH Ops");
    expect(m.text).toContain(link);
    expect(m.text).toContain("30 minutes");
    expect(m.html).toContain(link);
    expect(m.text).toContain("Awa Koné");
    expect(m.text.toLowerCase()).not.toContain("mot de passe temporaire :");
  });
  it("invitation : lien et durée de 72 heures", () => {
    const m = buildInvitationMail(user, link);
    expect(m.text).toContain(link);
    expect(m.text).toContain("72 heures");
  });
  it("mot de passe modifié : pas de lien, conseille de contacter SRH si ce n'est pas l'utilisateur", () => {
    const m = buildPasswordChangedMail(user);
    expect(m.text).not.toContain("http");
    expect(m.text).toContain("Si vous n'êtes pas à l'origine");
  });
  it("échappe le HTML du nom", () => {
    const m = buildResetMail({ nom: "<b>X</b>", email: "x@srh.ci" }, link);
    expect(m.html).not.toContain("<b>X</b>");
    expect(m.html).toContain("&lt;b&gt;X&lt;/b&gt;");
  });
});
```

```ts
// tests/integration/password-reset-flow.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

import { POST as forgot } from "@/app/api/auth/forgot-password/route";
import { POST as reset } from "@/app/api/auth/reset-password/route";
import { getMemoryTransport } from "@/lib/mail";
import { User } from "@/models/User";
import { PasswordResetToken } from "@/models/PasswordResetToken";

const OLD = "AncienMdp1";
const NEW = "NouveauMdp2";

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
});

describe("POST /api/auth/reset-password", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getMemoryTransport().reset();
    process.env.NEXTAUTH_URL = "https://ops.srh.ci";
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
});
```

Remplacer aussi, dans `tests/integration/users-auth.test.ts`, les deux tests qui attendent le 503 de l'ancienne route par le comportement ci-dessus (ou les supprimer, puisque `password-reset-flow.test.ts` les couvre) et le dire dans le rapport.

- [ ] **Step 2: Lancer** → FAIL.

- [ ] **Step 3: Implémenter**

```ts
// lib/app-url.ts
export class AppUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppUrlError";
  }
}

/** URL publique de l'application (liens des e-mails). */
export function appBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = env.NEXTAUTH_URL?.trim();
  if (!raw) throw new AppUrlError("NEXTAUTH_URL n'est pas défini");
  const url = raw.replace(/\/+$/, "");
  if (env.NODE_ENV === "production" && !url.startsWith("https://")) {
    throw new AppUrlError("NEXTAUTH_URL doit être en https en production");
  }
  return url;
}
```

```ts
// lib/run-after.ts
import { after } from "next/server";

/**
 * Exécute `task` après l'envoi de la réponse (temps de réponse indépendant du
 * travail fait : pas d'oracle temporel sur l'existence d'un compte). Hors
 * contexte de requête (tests), la tâche est exécutée immédiatement.
 */
export async function runAfterResponse(task: () => Promise<void>): Promise<void> {
  const safe = async () => {
    try {
      await task();
    } catch (error) {
      console.error("[after] tâche différée en échec :", error instanceof Error ? error.name : "erreur");
    }
  };

  try {
    after(safe);
  } catch {
    await safe();
  }
}
```

```ts
// lib/auth/account-mail.ts
import { sendMail } from "@/lib/mail";
import type { MailMessage, MailResult } from "@/lib/mail/types";

interface Recipient {
  nom: string;
  email: string;
}

const SIGNATURE = "L'équipe SRH Ops";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function html(paragraphs: string[], link?: { href: string; label: string }): string {
  const body = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  const button = link
    ? `<p><a href="${escapeHtml(link.href)}" style="display:inline-block;padding:10px 18px;background:#0d631b;color:#fff;border-radius:8px;text-decoration:none">${escapeHtml(link.label)}</a></p><p style="font-size:12px;color:#555">Ou copiez ce lien : ${escapeHtml(link.href)}</p>`
    : "";
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">${body}${button}<p>${SIGNATURE}</p></div>`;
}

export function buildResetMail(user: Recipient, link: string): MailMessage {
  const lines = [
    `Bonjour ${user.nom},`,
    "Vous avez demandé la réinitialisation de votre mot de passe SRH Ops.",
    "Ce lien est valable 30 minutes et ne peut servir qu'une fois.",
    "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.",
  ];
  return {
    to: user.email,
    subject: "SRH Ops — Réinitialisation de votre mot de passe",
    text: `${lines.join("\n\n")}\n\n${link}\n\n${SIGNATURE}`,
    html: html(lines, { href: link, label: "Choisir un nouveau mot de passe" }),
  };
}

export function buildInvitationMail(user: Recipient, link: string): MailMessage {
  const lines = [
    `Bonjour ${user.nom},`,
    "Un compte SRH Ops vient de vous être créé. Pour l'activer, choisissez votre mot de passe.",
    "Ce lien est valable 72 heures et ne peut servir qu'une fois. S'il expire, demandez un nouveau lien à votre administrateur.",
  ];
  return {
    to: user.email,
    subject: "SRH Ops — Activez votre compte",
    text: `${lines.join("\n\n")}\n\n${link}\n\n${SIGNATURE}`,
    html: html(lines, { href: link, label: "Activer mon compte" }),
  };
}

export function buildPasswordChangedMail(user: Recipient): MailMessage {
  const lines = [
    `Bonjour ${user.nom},`,
    "Le mot de passe de votre compte SRH Ops vient d'être modifié.",
    "Si vous n'êtes pas à l'origine de cette modification, contactez immédiatement un administrateur SRH.",
  ];
  return {
    to: user.email,
    subject: "SRH Ops — Votre mot de passe a été modifié",
    text: `${lines.join("\n\n")}\n\n${SIGNATURE}`,
    html: html(lines),
  };
}

export const sendResetLinkMail = (user: Recipient, link: string): Promise<MailResult> =>
  sendMail(buildResetMail(user, link));
export const sendInvitationMail = (user: Recipient, link: string): Promise<MailResult> =>
  sendMail(buildInvitationMail(user, link));
export const sendPasswordChangedMail = (user: Recipient): Promise<MailResult> =>
  sendMail(buildPasswordChangedMail(user));
```

```ts
// app/api/auth/forgot-password/route.ts (remplace le contenu actuel)
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { appBaseUrl } from "@/lib/app-url";
import { consumeRateLimit, clientIp } from "@/lib/rate-limit";
import { runAfterResponse } from "@/lib/run-after";
import { issueResetToken } from "@/lib/auth/reset-token";
import { sendResetLinkMail } from "@/lib/auth/account-mail";
import { forgotPasswordSchema } from "@/lib/validators/user";
import { User } from "@/models/User";

const HOUR = 3_600_000;
const NO_STORE = { "Cache-Control": "no-store" };

// Même réponse que le compte existe ou non : aucune énumération possible.
const GENERIC_MESSAGE =
  "Si un compte correspond à cet identifiant, un e-mail de réinitialisation vient d'être envoyé.";

async function sendLinkIfAccountExists(identifier: string): Promise<void> {
  await connectDB();
  const user = await User.findOne(
    identifier.includes("@") ? { email: identifier } : { username: identifier }
  ).select("_id nom email");
  if (!user) return;

  const { token } = await issueResetToken(String(user._id), "reset");
  const link = `${appBaseUrl()}/reset-password?token=${token}`;
  await sendResetLinkMail({ nom: user.nom, email: user.email }, link);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Identifiant requis" }, { status: 400, headers: NO_STORE });
  }

  const identifier = parsed.data.identifier.trim().toLowerCase();

  const [byIp, byIdentifier] = await Promise.all([
    consumeRateLimit("forgot-ip", clientIp(req), { limit: 10, windowMs: HOUR }),
    consumeRateLimit("forgot-id", identifier, { limit: 5, windowMs: HOUR }),
  ]);
  if (!byIp.allowed || !byIdentifier.allowed) {
    const retryAfter = Math.max(byIp.retryAfterSeconds, byIdentifier.retryAfterSeconds);
    return NextResponse.json(
      { error: "Trop de demandes. Réessayez plus tard." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(retryAfter) } }
    );
  }

  // Recherche, jeton et envoi après la réponse : le temps de réponse ne dépend pas de l'existence du compte.
  await runAfterResponse(() => sendLinkIfAccountExists(identifier));

  return NextResponse.json({ message: GENERIC_MESSAGE }, { headers: NO_STORE });
}
```

```ts
// app/api/auth/reset-password/route.ts
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { consumeRateLimit, clientIp } from "@/lib/rate-limit";
import { runAfterResponse } from "@/lib/run-after";
import { consumeResetToken } from "@/lib/auth/reset-token";
import { sendPasswordChangedMail } from "@/lib/auth/account-mail";
import { changePasswordSchema } from "@/lib/validators/user";
import { User } from "@/models/User";

const NO_STORE = { "Cache-Control": "no-store" };
const INVALID_LINK = "Lien invalide ou expiré. Demandez un nouveau lien.";

const resetSchema = z.object({
  token: z.string(),
  newPassword: changePasswordSchema.shape.newPassword,
});

export async function POST(req: NextRequest) {
  const limit = await consumeRateLimit("reset-ip", clientIp(req), { limit: 20, windowMs: 3_600_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez plus tard." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) {
    // Format invalide (mot de passe trop court…) : le jeton n'est pas consommé.
    const passwordIssue = parsed.error.issues.find((i) => i.path[0] === "newPassword");
    return NextResponse.json(
      { error: passwordIssue?.message ?? INVALID_LINK },
      { status: 400, headers: NO_STORE }
    );
  }

  const consumed = await consumeResetToken(parsed.data.token);
  if (!consumed) {
    return NextResponse.json({ error: INVALID_LINK }, { status: 400, headers: NO_STORE });
  }

  await connectDB();
  const hash = await bcrypt.hash(parsed.data.newPassword, 10);
  const user = await User.findByIdAndUpdate(
    consumed.userId,
    { $set: { motDePasseHash: hash, mustChangePassword: false, passwordChangedAt: new Date() } },
    { new: true }
  ).select("nom email");

  if (!user) {
    return NextResponse.json({ error: INVALID_LINK }, { status: 400, headers: NO_STORE });
  }

  await runAfterResponse(async () => {
    await sendPasswordChangedMail({ nom: user.nom, email: user.email });
  });

  return NextResponse.json({ message: "Mot de passe modifié. Vous pouvez vous connecter." }, { headers: NO_STORE });
}
```

Note : dans le test « mot de passe trop court », la validation Zod échoue **avant** `consumeResetToken` : c'est ce qui garantit que le jeton n'est pas consommé.

- [ ] **Step 4: Relancer** — `npx vitest run tests/unit/app-url.test.ts tests/unit/account-mail.test.ts tests/integration/password-reset-flow.test.ts tests/integration/users-auth.test.ts` → PASS ; puis `npx tsc --noEmit && npm run lint && npx vitest run`.

- [ ] **Step 5: Commit**

```bash
git add lib/app-url.ts lib/run-after.ts lib/auth/account-mail.ts app/api/auth tests
git commit -m "feat(auth): réinitialisation du mot de passe par jeton (réponse identique, débit limité, e-mails)"
```

---

### Task 7: Pages « mot de passe oublié » et « réinitialisation » + en-têtes de sécurité

**Files:**
- Create: `lib/validators/password-form.ts`, `app/reset-password/page.tsx`, `components/auth/ResetPasswordClient.tsx`, `components/auth/ForgotPasswordClient.tsx`
- Modify: `app/forgot-password/page.tsx`, `next.config.ts`
- Test: `tests/unit/password-form.test.ts`, `tests/unit/next-config-headers.test.ts`

**Interfaces:**
- Produces: `validateNewPassword(newPassword: string, confirmation: string): string | null` — message d'erreur français ou `null` (6 caractères minimum, confirmation identique).
- `next.config.ts` : `headers()` renvoie, pour `/reset-password` et `/forgot-password`, `Referrer-Policy: no-referrer` et `Cache-Control: no-store`.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// tests/unit/password-form.test.ts
import { describe, it, expect } from "vitest";
import { validateNewPassword } from "@/lib/validators/password-form";

describe("validateNewPassword", () => {
  it("accepte un mot de passe de 6 caractères et sa confirmation", () => {
    expect(validateNewPassword("abcdef", "abcdef")).toBeNull();
  });
  it("refuse moins de 6 caractères", () => {
    expect(validateNewPassword("abc", "abc")).toBe("Le mot de passe doit contenir au moins 6 caractères.");
  });
  it("refuse une confirmation différente", () => {
    expect(validateNewPassword("abcdef", "abcdeg")).toBe("Les deux mots de passe ne correspondent pas.");
  });
});
```

```ts
// tests/unit/next-config-headers.test.ts
import { describe, it, expect } from "vitest";
import nextConfig from "../../next.config";

describe("en-têtes des pages d'authentification", () => {
  it("/reset-password et /forgot-password : pas de Referer sortant, pas de cache", async () => {
    const rules = await nextConfig.headers!();
    for (const source of ["/reset-password", "/forgot-password"]) {
      const rule = rules.find((r) => r.source === source);
      expect(rule, source).toBeDefined();
      const map = Object.fromEntries(rule!.headers.map((h) => [h.key, h.value]));
      expect(map["Referrer-Policy"]).toBe("no-referrer");
      expect(map["Cache-Control"]).toBe("no-store");
    }
  });
});
```

- [ ] **Step 2: Lancer** → FAIL.

- [ ] **Step 3: Implémenter**

```ts
// lib/validators/password-form.ts
export function validateNewPassword(newPassword: string, confirmation: string): string | null {
  if (newPassword.length < 6) return "Le mot de passe doit contenir au moins 6 caractères.";
  if (newPassword !== confirmation) return "Les deux mots de passe ne correspondent pas.";
  return null;
}
```

`next.config.ts` : ajouter à `nextConfig` (sans toucher aux autres clés) :

```ts
  async headers() {
    const noLeak = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Cache-Control", value: "no-store" },
    ];
    return [
      { source: "/reset-password", headers: noLeak },
      { source: "/forgot-password", headers: noLeak },
    ];
  },
```

Pages (lire d'abord `app/login/page.tsx` et l'actuelle `app/forgot-password/page.tsx` pour reprendre exactement le même habillage : logo, carte, classes Tailwind du système « Industrial Integrity ») :

- `app/forgot-password/page.tsx` : page serveur qui rend `<ForgotPasswordClient />` dans l'habillage existant (retirer l'encart « Réinitialisation en libre-service indisponible »).
- `components/auth/ForgotPasswordClient.tsx` (`"use client"`) : champ « E-mail ou nom d'utilisateur », bouton « Envoyer le lien », `POST /api/auth/forgot-password`. Sur 200 : afficher **le message renvoyé par l'API** (toujours le même) et masquer le formulaire ; sur 429 : afficher l'erreur via `formatApiError` ; sur autre erreur : message générique. Lien « Retour à la connexion ». Désactiver le bouton pendant la requête.
- `app/reset-password/page.tsx` : page serveur (sans garde de session : page publique) qui rend `<ResetPasswordClient />` dans le même habillage, enveloppé dans `<Suspense>`.
- `components/auth/ResetPasswordClient.tsx` (`"use client"`) : lit `token` avec `useSearchParams()`, **puis retire le jeton de l'URL** (`window.history.replaceState(null, "", "/reset-password")`) en le conservant en mémoire (`useRef`/état) ; sans jeton : message « Lien invalide » + lien vers `/forgot-password`. Champs « Nouveau mot de passe » et « Confirmation » (`type="password"`, `minLength={6}`, `autoComplete="new-password"`), validation locale avec `validateNewPassword`, `POST /api/auth/reset-password { token, newPassword }`. Succès : message « Mot de passe modifié » et bouton vers `/login` ; 400 : afficher l'erreur de l'API (via `formatApiError`) avec lien « Demander un nouveau lien » ; 429 : idem. Ne jamais afficher ni journaliser le jeton ni le mot de passe.
- Aucune de ces pages n'appelle `requirePageAccess` (pages publiques ; `middleware.ts` les exclut déjà). Vérifier que `tests/unit/page-guards.test.ts` ne scanne que `app/(dashboard)` (il doit rester vert).

Pas de test automatique des composants (aucun banc React) : vérification par lecture, `tsc` et lint ; le dire dans le rapport.

- [ ] **Step 4: Relancer** — les deux tests, puis `npx tsc --noEmit && npm run lint && npx vitest run`. Ne pas lancer `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add lib/validators/password-form.ts app/forgot-password app/reset-password components/auth next.config.ts tests/unit
git commit -m "feat(auth): pages mot de passe oublié et réinitialisation, en-têtes sans Referer ni cache"
```

---

### Task 8: Invitation à la création d'un compte et lien envoyé par l'administrateur

**Files:**
- Modify: `app/api/users/route.ts`, `components/users/UserFormModal.tsx`, `components/users/UsersListClient.tsx`, `tests/integration/users-auth.test.ts`, `tests/integration/users-scope.test.ts` (adapter les attentes sur `generatedPassword`)
- Create: `app/api/users/[id]/send-reset-link/route.ts`
- Test: `tests/integration/user-invitation.test.ts`, `tests/integration/send-reset-link.test.ts`

**Interfaces:**
- Consumes: `issueResetToken`, `sendInvitationMail`, `sendResetLinkMail`, `appBaseUrl`, `consumeRateLimit`, `getMemoryTransport`.
- Modifie `POST /api/users` (201, `Cache-Control: no-store`) : le compte est créé avec un mot de passe temporaire aléatoire (comme aujourd'hui), un jeton d'invitation (72 h) est émis et l'e-mail d'invitation envoyé.
  - envoi réussi → `{ user, invitation: "sent", message: "Invitation envoyée à <e-mail>." }` — **sans** `generatedPassword` ;
  - envoi impossible (`not_configured` / `send_failed`, ou `NEXTAUTH_URL` invalide) → `{ user, invitation: "not_sent", generatedPassword, message: "L'e-mail n'a pas pu être envoyé : communiquez le mot de passe temporaire à l'utilisateur." }`.
- Crée `POST /api/users/[id]/send-reset-link` (administrateur uniquement) → `200 { sent: true }` ou `502 { sent: false, reason }` ; `429` au-delà de 5 par heure et par utilisateur ciblé ; `404` si le compte n'existe pas ; identifiant invalide → `400`.
- La régénération du mot de passe affiché (`reset-password`, existante) est conservée comme solution de repli.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// tests/integration/user-invitation.test.ts
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
```

```ts
// tests/integration/send-reset-link.test.ts
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
```

- [ ] **Step 2: Lancer** → FAIL.

- [ ] **Step 3: Implémenter `POST /api/users`.** Lire `app/api/users/route.ts` en entier. Après `User.create(...)` (le mot de passe temporaire `generatedPassword` et son hash sont conservés), remplacer le commentaire « Aucun envoi d'e-mail… » par :

```ts
  // Invitation : lien d'activation valable 72 h ; le mot de passe temporaire ne sert qu'en repli.
  let invitationSent = false;
  try {
    const { token } = await issueResetToken(String(user._id), "invitation");
    const link = `${appBaseUrl()}/reset-password?token=${token}`;
    const result = await sendInvitationMail({ nom, email: email.toLowerCase() }, link);
    invitationSent = result.ok;
  } catch (error) {
    console.error("[invitation] impossible de préparer l'e-mail :", error instanceof Error ? error.name : "erreur");
  }
```

Réponse :

```ts
  const createdUser = /* findById… inchangé */;
  const body = invitationSent
    ? { user: createdUser, invitation: "sent", message: `Invitation envoyée à ${email.toLowerCase()}.` }
    : {
        user: createdUser,
        invitation: "not_sent",
        generatedPassword,
        message: "L'e-mail n'a pas pu être envoyé : communiquez le mot de passe temporaire à l'utilisateur.",
      };
  return NextResponse.json(body, { status: 201, headers: { "Cache-Control": "no-store" } });
```

Adapter les tests existants qui attendaient `generatedPassword` sur un envoi réussi (`users-auth.test.ts`, `users-scope.test.ts`, éventuellement `users-reset-password.test.ts`) : dans l'environnement de test le transport est en mémoire, donc l'envoi réussit et **aucun mot de passe n'est renvoyé** ; les tests qui ont besoin du mot de passe doivent appeler `getMemoryTransport().failNext()` avant la requête. Lister chaque test modifié et la raison dans le rapport ; ne jamais affaiblir une assertion d'état.

- [ ] **Step 4: Implémenter la route du lien**

```ts
// app/api/users/[id]/send-reset-link/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { guardObjectId } from "@/lib/mongo-id";
import { appBaseUrl } from "@/lib/app-url";
import { consumeRateLimit } from "@/lib/rate-limit";
import { issueResetToken } from "@/lib/auth/reset-token";
import { sendResetLinkMail } from "@/lib/auth/account-mail";
import { User } from "@/models/User";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const NO_STORE = { "Cache-Control": "no-store" };

/** Envoie à l'utilisateur un lien de réinitialisation (administrateur uniquement). Ne modifie pas le mot de passe. */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  const limit = await consumeRateLimit("send-link", id, { limit: 5, windowMs: 3_600_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Trop de liens envoyés à ce compte. Réessayez plus tard." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  await connectDB();
  const user = await User.findById(id).select("nom email");
  if (!user) {
    return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
  }

  let result: { ok: boolean; reason?: string };
  try {
    const { token } = await issueResetToken(id, "reset");
    result = await sendResetLinkMail({ nom: user.nom, email: user.email }, `${appBaseUrl()}/reset-password?token=${token}`);
  } catch {
    result = { ok: false, reason: "not_configured" };
  }

  return result.ok
    ? NextResponse.json({ sent: true }, { headers: NO_STORE })
    : NextResponse.json({ sent: false, reason: result.reason }, { status: 502, headers: NO_STORE });
}
```

- [ ] **Step 5: Interface** (lire `components/users/UserFormModal.tsx` et `UsersListClient.tsx` en entier) :
  - `UserFormModal` : dans le panneau de succès après création, si `data.invitation === "sent"` afficher « Invitation envoyée à <e-mail>. L'utilisateur choisira son mot de passe via le lien (valable 72 h). » et **ne pas** afficher `TemporaryPasswordPanel` ; si `data.invitation === "not_sent"` afficher `data.message` puis `TemporaryPasswordPanel` avec `data.generatedPassword` (comportement actuel).
  - `UsersListClient` : ajouter une action par ligne « Envoyer un lien de réinitialisation » (avec le même garde anti-double-clic que « Régénérer le mot de passe », état `sendingLinkId`) qui appelle la nouvelle route et affiche « Lien envoyé à <e-mail>. » ou l'erreur (« L'envoi a échoué : vérifiez les paramètres SMTP. » pour 502 ; message de l'API via `formatApiError` sinon). Conserver « Régénérer le mot de passe » (repli sans e-mail).
  - Pas de test automatique de ces composants : vérification par lecture, `tsc`, lint ; le dire dans le rapport.

- [ ] **Step 6: Relancer** — `npx vitest run tests/integration/user-invitation.test.ts tests/integration/send-reset-link.test.ts tests/integration/users-auth.test.ts tests/integration/users-scope.test.ts tests/integration/users-reset-password.test.ts` → PASS ; puis `npx tsc --noEmit && npm run lint && npx vitest run`.

- [ ] **Step 7: Commit**

```bash
git add app/api/users components/users tests/integration
git commit -m "feat(users): invitation par e-mail à la création, lien de réinitialisation envoyé par l'administrateur"
```

---

### Task 9: Test manuel du SMTP, documentation et vérification finale

**Files:**
- Create: `scripts/send-test-mail.ts`
- Modify: `README.md`, `PLAN.md`, `scripts/generate-progress-report.ts`, `docs/superpowers/plans/2026-09-20-lot1-master.md`

- [ ] **Step 1: Script d'envoi de test** (sans base de données, lit `.env.local` comme `scripts/seed-admin.ts` via `@next/env`) :

```ts
// scripts/send-test-mail.ts
import { loadEnvConfig } from "@next/env";
import { sendMail } from "../lib/mail";

async function main() {
  loadEnvConfig(process.cwd());
  const to = process.argv[2];
  if (!to || !to.includes("@")) {
    console.error("Usage : npx tsx scripts/send-test-mail.ts adresse@exemple.com");
    process.exit(2);
  }
  const result = await sendMail({
    to,
    subject: "SRH Ops — e-mail de test",
    text: "Cet e-mail confirme que l'envoi de messages depuis SRH Ops fonctionne.\n\nL'équipe SRH Ops",
  });
  console.log(result.ok ? "E-mail envoyé." : `Échec : ${result.reason}`);
  process.exit(result.ok ? 0 : 1);
}

void main();
```

Vérifier que `@next/env` est disponible (`node_modules/@next/env`) ; s'il ne l'est pas, lire le début de `scripts/seed-admin.ts` pour reprendre la même méthode de chargement de `.env.local`. **Ne pas exécuter ce script** : il envoie un vrai message avec le mot de passe SMTP de `.env.local`, que seul l'utilisateur doit déclencher.

- [ ] **Step 2: README** — nouvelle section « E-mail (SMTP) » : variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, `NEXTAUTH_URL`), valeurs pour SRH (`mail.thelabyrinth.africa`, 465 SSL ou 587 STARTTLS, `contact@thelabyrinth.africa`), **où renseigner le mot de passe** (`.env.local` en local ; Vercel → Settings → Environment Variables, Sensitive, Production et Preview), la commande de test `npx tsx scripts/send-test-mail.ts adresse@exemple.com` et le bouton administrateur « Envoyer un e-mail de test » (page Mon compte), la note de délivrabilité (SPF/DKIM du domaine à vérifier chez l'hébergeur ; l'expéditeur doit être la boîte authentifiée), et le comportement en cas d'échec (repli sur le mot de passe temporaire affiché à l'administrateur). Mettre à jour la section « Mot de passe oublié » : flux à jeton (30 min, usage unique), réponse identique, limites (5/h par identifiant, 10/h par IP), sessions ouvertes invalidées au plus 5 minutes après une réinitialisation, invitation de 72 h à la création d'un compte, action « Envoyer un lien de réinitialisation ». Retirer les phrases devenues fausses (« réinitialisation en libre-service désactivée », « aucun e-mail n'est envoyé »).

- [ ] **Step 3: PLAN.md, rapport et master.** PLAN.md : ligne de journal « Lot 1B — e-mail SMTP et réinitialisation par jeton » (20 septembre 2026). `scripts/generate-progress-report.ts` : Phase 5 — le canal e-mail est livré (transport SMTP, invitations, réinitialisation) ; retirer « aucun transport d'e-mail » et « rapport par e-mail » reste ouvert (1C.8) ; ne pas régénérer ni commiter le PDF. Master : marquer B1 et B2 « traité par 1B ».

- [ ] **Step 4: Vérification complète**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: `tsc` propre, 0 erreur de lint, tous les tests verts (328 + ceux du lot).

- [ ] **Step 5: Recherche de fuites** — `grep -rn "console\.\(log\|info\|warn\|error\)" lib/mail lib/auth lib/rate-limit.ts lib/run-after.ts app/api/auth app/api/mail app/api/users` : aucune ligne ne doit imprimer un corps d'e-mail, un lien, un jeton, un mot de passe ni une adresse e-mail ; lister les lignes trouvées dans le rapport.

- [ ] **Step 6: Commit**

```bash
git add scripts/send-test-mail.ts README.md PLAN.md scripts/generate-progress-report.ts docs/superpowers/plans/2026-09-20-lot1-master.md
git commit -m "docs: e-mail SMTP, réinitialisation par jeton et script de test"
```

- [ ] **Step 7: Revue de branche complète** (skill `superpowers:requesting-code-review`, modèle le plus capable), avec les critères : aucune énumération de comptes (contenu, code, temps), jeton jamais en clair (base, logs, réponses), usage unique atomique, limites de débit effectives, invalidation des sessions, aucun secret SMTP lisible, aucun test n'envoie de vrai e-mail, repli sans e-mail cohérent.

---

## Recette manuelle (à faire par l'utilisateur, avec le vrai mot de passe SMTP)

Le mot de passe n'est jamais donné à l'agent : l'utilisateur le place dans `.env.local` puis exécute lui-même les étapes ci-dessous.

- [ ] `npx tsx scripts/send-test-mail.ts <votre adresse>` → « E-mail envoyé. » et message reçu (vérifier le dossier des indésirables).
- [ ] Si l'envoi échoue en 465 : essayer `SMTP_PORT=587` (STARTTLS) ; à défaut `SMTP_HOST=mail38.lwspanel.com`.
- [ ] Application lancée avec une base **de test** (jamais la base réelle) : « Mot de passe oublié » → e-mail reçu → lien → nouveau mot de passe → connexion ; second clic sur le lien → refusé.
- [ ] Créer un utilisateur → invitation reçue → activation par le lien.
- [ ] Sur Vercel : variables `SMTP_*`, `MAIL_FROM` et `NEXTAUTH_URL` (https) renseignées pour Production et Preview, puis bouton « Envoyer un e-mail de test » depuis Mon compte.

---

## Auto-relecture

- **Couverture (master 1B) :** B1 (transport d'e-mail) → tâche 1 ; B2 (réinitialisation à jeton) → tâches 4, 6, 7 ; 1B.3 (invitation) → tâche 8 ; limitation de débit → tâche 2 ; test d'envoi → tâche 3 et script de la tâche 9 ; invalidation des sessions (ajoutée : une réinitialisation ne sert à rien si l'ancienne session reste ouverte) → tâche 5.
- **Placeholders :** les tâches 1 à 6 et 8 contiennent le code complet des tests et des modules nouveaux ; les tâches 3 (bouton), 7 (pages) et 8 (composants) décrivent l'interface à partir de fichiers existants à lire d'abord, faute de banc de test React — le plan le dit et exige la vérification par `tsc` et lint.
- **Cohérence des noms :** `sendMail`, `getMemoryTransport`, `MemoryTransport.failNext`, `consumeRateLimit(scope, id, opts, now?)`, `clientIp`, `issueResetToken(userId, purpose, now?)`, `consumeResetToken(token, now?)`, `hashToken`, `appBaseUrl`, `runAfterResponse`, `sendResetLinkMail` / `sendInvitationMail` / `sendPasswordChangedMail`, `passwordChangedAt`, `issuedAt` sont définis à leur première apparition et utilisés à l'identique ensuite.
- **Points de vigilance à l'exécution :** (1) `NODE_ENV === "test"` sélectionne le transport mémoire : les tests de la tâche 1 passent un `env` explicite pour ne pas en dépendre ; (2) la tâche 8 modifie le contrat de `POST /api/users` (plus de `generatedPassword` quand l'e-mail part) : plusieurs tests existants changent ; (3) `after()` n'a pas de contexte dans Vitest : `runAfterResponse` retombe sur l'exécution immédiate ; en production, vérifier une fois que l'e-mail part bien après la réponse ; (4) la limitation de débit est à fenêtre fixe (jusqu'à 2 × la limite à cheval sur deux fenêtres) ; (5) l'invalidation des sessions prend effet au plus 5 minutes après la réinitialisation (relecture du jeton).
