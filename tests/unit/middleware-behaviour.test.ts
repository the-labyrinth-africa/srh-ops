import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import type { NextFetchEvent } from "next/server";
import { encode } from "next-auth/jwt";
import middleware from "../../src/middleware";

// Parité de comportement : le middleware d'authentification doit rediriger les visiteurs sans
// session vers la page de connexion NextAuth, et laisser passer ceux qui ont un jeton valide.
const SECRET = "secret-de-test-middleware";
const evenement = {} as NextFetchEvent;

async function appeler(req: NextRequest) {
  // Le type de retour de next-auth est large (Response | void | Promise<...>) : on l'attend.
  return (await (middleware as unknown as (r: NextRequest, e: NextFetchEvent) => unknown)(
    req,
    evenement,
  )) as Response | undefined;
}

describe("middleware d'authentification (comportement)", () => {
  const ancienSecret = process.env.NEXTAUTH_SECRET;
  const ancienneUrl = process.env.NEXTAUTH_URL;

  beforeAll(() => {
    process.env.NEXTAUTH_SECRET = SECRET;
    // Fixe le nom du cookie de session (`next-auth.session-token`, sans préfixe `__Secure-`).
    process.env.NEXTAUTH_URL = "http://localhost:3000";
  });

  afterAll(() => {
    if (ancienSecret === undefined) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = ancienSecret;
    if (ancienneUrl === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = ancienneUrl;
  });

  it("redirige vers la connexion NextAuth sans cookie de session", async () => {
    const reponse = await appeler(new NextRequest("http://localhost:3000/clients"));
    expect(reponse).toBeDefined();
    expect([302, 307]).toContain(reponse!.status);
    const location = reponse!.headers.get("location") ?? "";
    // Valeur complète : page de connexion NextAuth + chemin demandé en callbackUrl (relatif, encodé).
    expect(location).toBe("http://localhost:3000/api/auth/signin?callbackUrl=%2Fclients");
  });

  it("laisse passer la requête avec un jeton de session valide", async () => {
    const jeton = await encode({ token: { sub: "u1", id: "u1", username: "test", role: "admin" }, secret: SECRET });
    const req = new NextRequest("http://localhost:3000/clients", {
      headers: { cookie: `next-auth.session-token=${jeton}` },
    });
    const reponse = await appeler(req);
    // next-auth renvoie `undefined` quand la requête est autorisée : Next la laisse alors passer.
    expect(reponse).toBeUndefined();
  });

  it("redirige vers la connexion quand le jeton de session est expiré", async () => {
    const jeton = await encode({
      token: { sub: "u1", id: "u1", username: "test", role: "admin" },
      secret: SECRET,
      maxAge: -60, // expiré depuis une minute
    });
    const reponse = await appeler(
      new NextRequest("http://localhost:3000/clients", {
        headers: { cookie: `next-auth.session-token=${jeton}` },
      }),
    );
    expect(reponse).toBeDefined();
    expect([302, 307]).toContain(reponse!.status);
    expect(reponse!.headers.get("location") ?? "").toContain("/api/auth/signin");
  });

  it("redirige vers la connexion quand le cookie de session est invalide", async () => {
    const reponse = await appeler(
      new NextRequest("http://localhost:3000/clients", {
        headers: { cookie: "next-auth.session-token=ceci-n-est-pas-un-jeton" },
      }),
    );
    expect(reponse).toBeDefined();
    expect([302, 307]).toContain(reponse!.status);
    expect(reponse!.headers.get("location") ?? "").toContain("/api/auth/signin");
  });
});
