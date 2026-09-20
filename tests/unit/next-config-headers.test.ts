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
