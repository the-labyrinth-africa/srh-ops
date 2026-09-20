import { describe, it, expect } from "vitest";
import { validateNewPassword } from "@/lib/validators/password-form";

describe("validateNewPassword", () => {
  it("accepte un mot de passe de 6 caractères et sa confirmation", () => {
    expect(validateNewPassword("abcdef", "abcdef")).toBeNull();
  });
  it("refuse moins de 6 caractères", () => {
    expect(validateNewPassword("abc", "abc")).toBe("Le mot de passe doit contenir au moins 6 caractères.");
  });
  it("refuse une confirmation différente", () => {
    expect(validateNewPassword("abcdef", "abcdeg")).toBe("Les deux mots de passe ne correspondent pas.");
  });
});
