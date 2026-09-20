import { describe, it, expect, vi, afterEach } from "vitest";
import { sendMail, resolveTransport, getMemoryTransport } from "@/lib/mail";
import { MailConfigError } from "@/lib/mail/config";
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
  it("refuse le transport mémoire en production (not_configured côté appelant)", () => {
    expect(() => resolveTransport({ NODE_ENV: "production", MAIL_TRANSPORT: "memory" })).toThrow(MailConfigError);
    expect(() =>
      resolveTransport({ NODE_ENV: "production", MAIL_TRANSPORT: "memory", SMTP_HOST: "h", SMTP_USER: "u@x.org", SMTP_PASSWORD: "p" })
    ).toThrow(MailConfigError);
  });
  it("en production sans MAIL_TRANSPORT=memory, SMTP reste utilisable", () => {
    const t = resolveTransport({ NODE_ENV: "production", SMTP_HOST: "h", SMTP_USER: "u@x.org", SMTP_PASSWORD: "p" });
    expect(t).toBeInstanceOf(SmtpTransport);
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

  it("refuse MAIL_TRANSPORT=memory en production : not_configured et aucun message stocké", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await sendMail(message, { NODE_ENV: "production", MAIL_TRANSPORT: "memory" });
    expect(result).toEqual({ ok: false, reason: "not_configured" });
    expect(getMemoryTransport().sent).toHaveLength(0);
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
