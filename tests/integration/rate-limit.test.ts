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
