import { describe, it, expect } from "vitest";
import { SystemClock } from "./horloge";

describe("SystemClock", () => {
  it("renvoie une Date proche de l'instant présent", () => {
    const avant = Date.now();
    const maintenant = new SystemClock().maintenant();
    const apres = Date.now();
    expect(maintenant).toBeInstanceOf(Date);
    expect(maintenant.getTime()).toBeGreaterThanOrEqual(avant);
    expect(maintenant.getTime()).toBeLessThanOrEqual(apres);
  });

  it("renvoie une nouvelle Date à chaque appel", async () => {
    const horloge = new SystemClock();
    const t1 = horloge.maintenant();
    await new Promise((r) => setTimeout(r, 5));
    const t2 = horloge.maintenant();
    expect(t2.getTime()).toBeGreaterThan(t1.getTime());
  });
});
