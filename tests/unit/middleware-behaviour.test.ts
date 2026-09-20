import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import type { NextFetchEvent } from "next/server";
import { encode } from "next-auth/jwt";
import middleware from "../../middleware";

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
  beforeAll(() => {
    process.env.NEXTAUTH_SECRET = SECRET;
  });

  it("redirige vers la connexion NextAuth sans cookie de session", async () => {
    const reponse = await appeler(new NextRequest("http://localhost:3000/clients"));
    expect(reponse).toBeDefined();
    expect([302, 307]).toContain(reponse!.status);
    const location = reponse!.headers.get("location") ?? "";
    expect(location).toContain("/api/auth/signin");
    expect(location).toContain("callbackUrl");
  });

  it("laisse passer la requête avec un jeton de session valide", async () => {
    const jeton = await encode({ token: { sub: "u1", id: "u1", username: "test", role: "admin" }, secret: SECRET });
    const req = new NextRequest("http://localhost:3000/clients", {
      headers: { cookie: `next-auth.session-token=${jeton}` },
    });
    const reponse = await appeler(req);
    // next-auth renvoie `undefined` quand la requête est autorisée : Next la laisse alors passer.
    // Toute réponse renvoyée ne doit en tout cas pas être une redirection.
    if (reponse !== undefined) {
      expect(reponse.headers.get("location")).toBeNull();
      expect(reponse.status).toBe(200);
    }
  });
});
