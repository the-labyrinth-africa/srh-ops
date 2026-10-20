import { describe, it, expect } from "vitest";
import { shouldSeed } from "../../scripts/seed-admin";
import { shouldSeedSuperadminOnBuild } from "../../scripts/seed-superadmin";

describe("shouldSeed", () => {
  it("seed toujours lors d'un lancement manuel (sans --on-build)", () => {
    expect(shouldSeed({}, [])).toBe(true);
  });

  describe("shouldSeedSuperadminOnBuild", () => {
    it("seed à chaque exécution manuelle", () => {
      expect(shouldSeedSuperadminOnBuild({}, [])).toBe(true);
    });

    it("seed automatiquement en build Vercel production", () => {
      expect(shouldSeedSuperadminOnBuild({ VERCEL_ENV: "production" }, ["--on-build"])).toBe(true);
    });

    it("ignore le seed lors des builds Preview et locaux par défaut", () => {
      expect(shouldSeedSuperadminOnBuild({ VERCEL_ENV: "preview" }, ["--on-build"])).toBe(false);
      expect(shouldSeedSuperadminOnBuild({}, ["--on-build"])).toBe(false);
    });

    it("permet l'activation explicite hors Vercel", () => {
      expect(shouldSeedSuperadminOnBuild({ PLATFORM_SEED_ON_BUILD: "true" }, ["--on-build"])).toBe(true);
    });
  });
  it("ne seed pas pendant le build sans SEED_ON_BUILD=true", () => {
    expect(shouldSeed({}, ["--on-build"])).toBe(false);
    expect(shouldSeed({ SEED_ON_BUILD: "false" }, ["--on-build"])).toBe(false);
  });
  it("seed pendant le build si SEED_ON_BUILD=true", () => {
    expect(shouldSeed({ SEED_ON_BUILD: "true" }, ["--on-build"])).toBe(true);
  });
});
