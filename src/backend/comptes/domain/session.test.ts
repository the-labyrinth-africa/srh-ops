import { describe, it, expect } from "vitest";
import { sessionEstValide } from "./session";

describe("sessionEstValide", () => {
  it("valide sans passwordChangedAt", () => {
    expect(sessionEstValide({ issuedAtMs: 1000 })).toBe(true);
  });
  it("invalide si passwordChangedAt est postérieur à issuedAt", () => {
    expect(sessionEstValide({ issuedAtMs: 1000, passwordChangedAtMs: 2000 })).toBe(false);
  });
  it("valide si passwordChangedAt est antérieur ou égal à issuedAt", () => {
    expect(sessionEstValide({ issuedAtMs: 2000, passwordChangedAtMs: 1000 })).toBe(true);
    expect(sessionEstValide({ issuedAtMs: 2000, passwordChangedAtMs: 2000 })).toBe(true);
  });
  it("un jeton sans issuedAt est considéré antérieur à toute réinitialisation", () => {
    expect(sessionEstValide({ passwordChangedAtMs: 1000 })).toBe(false);
  });
});
