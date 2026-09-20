import { describe, it, expect } from "vitest";
import { formatApiError } from "@/lib/api-error";

describe("formatApiError", () => {
  it("renvoie la chaîne telle quelle", () => {
    expect(formatApiError("Client introuvable")).toBe("Client introuvable");
  });

  it("renvoie le message d'un objet { message }", () => {
    expect(formatApiError({ message: "Boom" })).toBe("Boom");
  });

  it("prend le premier message de fieldErrors (flatten Zod)", () => {
    expect(
      formatApiError({
        formErrors: ["Erreur globale"],
        fieldErrors: { nom: [], clientId: ["Un compte client doit être rattaché à un client"] },
      })
    ).toBe("Un compte client doit être rattaché à un client");
  });

  it("se rabat sur formErrors quand fieldErrors est vide", () => {
    expect(formatApiError({ formErrors: ["Erreur globale"], fieldErrors: {} })).toBe("Erreur globale");
  });

  it("renvoie le message par défaut pour un flatten vide", () => {
    expect(formatApiError({ formErrors: [], fieldErrors: {} })).toBe("Erreur de traitement");
  });

  it("renvoie le message par défaut pour undefined, null ou une valeur inattendue", () => {
    expect(formatApiError(undefined)).toBe("Erreur de traitement");
    expect(formatApiError(null)).toBe("Erreur de traitement");
    expect(formatApiError(42)).toBe("Erreur de traitement");
    expect(formatApiError({ message: 5 })).toBe("Erreur de traitement");
  });

  it("accepte un message par défaut personnalisé", () => {
    expect(formatApiError(undefined, "Erreur lors de la suppression")).toBe("Erreur lors de la suppression");
  });
});
