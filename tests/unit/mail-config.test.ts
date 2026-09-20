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
