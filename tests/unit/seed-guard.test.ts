import { describe, it, expect } from "vitest";
import { shouldSeed } from "../../scripts/seed-admin";

describe("shouldSeed", () => {
  it("seed toujours lors d'un lancement manuel (sans --on-build)", () => {
    expect(shouldSeed({}, [])).toBe(true);
  });
  it("ne seed pas pendant le build sans SEED_ON_BUILD=true", () => {
    expect(shouldSeed({}, ["--on-build"])).toBe(false);
    expect(shouldSeed({ SEED_ON_BUILD: "false" }, ["--on-build"])).toBe(false);
  });
  it("seed pendant le build si SEED_ON_BUILD=true", () => {
    expect(shouldSeed({ SEED_ON_BUILD: "true" }, ["--on-build"])).toBe(true);
  });
});
