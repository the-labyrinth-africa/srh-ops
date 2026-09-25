import { describe, it, expect, vi } from "vitest";
import nodemailer from "nodemailer";
import { SmtpTransport } from "@/backend/platform/email/smtp-transport";
import { MemoryTransport } from "@/backend/platform/email/memory-transport";

describe("SmtpTransport.fromConfig", () => {
  it("borne la résolution DNS et les délais de connexion", () => {
    const spy = vi.spyOn(nodemailer, "createTransport");
    SmtpTransport.fromConfig({ host: "h", port: 465, secure: true, user: "u", pass: "p", from: "SRH <u>" });
    const options = spy.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(options.dnsTimeout).toBe(10_000);
    expect(options.connectionTimeout).toBe(10_000);
    expect(options.socketTimeout).toBe(15_000);
    spy.mockRestore();
  });
});

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
