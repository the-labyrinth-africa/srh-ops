import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./cron.controleur";

const previousSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (previousSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previousSecret;
});

describe("cron des notifications", () => {
  it("échoue explicitement si le secret de déploiement n'est pas configuré", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(new NextRequest("http://localhost/api/cron/notifications"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Service de notifications non configuré." });
  });

  it("refuse les appels qui ne présentent pas le secret configuré", async () => {
    process.env.CRON_SECRET = "secret-attendu";
    const request = new NextRequest("http://localhost/api/cron/notifications", {
      headers: { authorization: "Bearer secret-incorrect" },
    });
    const response = await GET(request);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Accès refusé." });
  });
});
