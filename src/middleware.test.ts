import { NextRequest, NextResponse, type NextFetchEvent } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { withAuthMock } = vi.hoisted(() => ({
  withAuthMock: vi.fn(),
}));

vi.mock("next-auth/middleware", () => ({
  default: withAuthMock,
}));

import middleware from "./middleware";

const request = (url: string) =>
  Object.assign(new NextRequest(url), { nextauth: { token: null } });

describe("middleware", () => {
  beforeEach(() => {
    withAuthMock.mockReset();
  });

  it("répond en JSON 401 pour une API protégée sans session", async () => {
    const req = request("http://localhost:3000/api/operations");
    withAuthMock.mockResolvedValue(
      NextResponse.redirect(new URL("/api/auth/signin?callbackUrl=%2Fapi%2Foperations", req.url))
    );

    const response = await middleware(req, {} as NextFetchEvent);

    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({ error: "Non authentifié" });
  });

  it("conserve la redirection de connexion pour les pages", async () => {
    const req = request("http://localhost:3000/operations");
    const redirect = NextResponse.redirect(
      new URL("/api/auth/signin?callbackUrl=%2Foperations", req.url)
    );
    withAuthMock.mockResolvedValue(redirect);

    const response = await middleware(req, {} as NextFetchEvent);

    expect(response).toBe(redirect);
  });

  it("conserve les redirections API qui ne mènent pas à la connexion", async () => {
    const req = request("http://localhost:3000/api/operations");
    const redirect = NextResponse.redirect(
      new URL("/api/auth/error?error=Configuration", req.url)
    );
    withAuthMock.mockResolvedValue(redirect);

    const response = await middleware(req, {} as NextFetchEvent);

    expect(response).toBe(redirect);
  });

  it("laisse passer la réponse des requêtes authentifiées", async () => {
    const req = request("http://localhost:3000/api/operations");
    const next = NextResponse.next();
    withAuthMock.mockResolvedValue(next);

    const response = await middleware(req, {} as NextFetchEvent);

    expect(response).toBe(next);
  });
});
