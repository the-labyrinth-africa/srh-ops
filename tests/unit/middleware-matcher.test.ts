import { describe, it, expect } from "vitest";
import { config } from "../../middleware";

// Sémantique du matcher Next : le motif est ancré sur le chemin entier.
const re = new RegExp(`^${config.matcher[0]}$`);

describe("middleware matcher", () => {
  it.each(["/login", "/forgot-password", "/reset-password", "/api/auth/session"])(
    "%s n'est pas protégé",
    (path) => {
      expect(re.test(path)).toBe(false);
    },
  );

  it.each(["/", "/clients", "/operations/123", "/profil"])("%s est protégé", (path) => {
    expect(re.test(path)).toBe(true);
  });
});
