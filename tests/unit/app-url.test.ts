import { describe, it, expect } from "vitest";
import { appBaseUrl, AppUrlError } from "@/backend/platform/http/url-applicative";

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
