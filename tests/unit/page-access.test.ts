import { describe, it, expect } from "vitest";
import { canAccessPath, homePathFor } from "@/shared/acces/acces-pages";
import { USER_ROLES } from "@/shared/acces/roles";

const ID = "507f1f77bcf86cd799439011";
const STAFF = ["admin", "dispatcher", "lecture"];
const WRITERS = ["admin", "dispatcher"];

// [chemin, rôles autorisés] — miroir de la matrice du plan.
const EXPECTED: Array<[string, string[]]> = [
  ["/", STAFF],
  ["/operations", STAFF],
  ["/operations/planning", STAFF],
  ["/operations/nouveau", WRITERS],
  [`/operations/${ID}`, [...STAFF, "chauffeur"]],
  ["/recurrences", STAFF],
  ["/clients", STAFF],
  ["/equipes", STAFF],
  ["/vehicules", STAFF],
  ["/equipements", STAFF],
  ["/import", WRITERS],
  ["/utilisateurs", ["admin"]],
  ["/terrain", ["admin", "dispatcher", "chauffeur"]],
  ["/profil", [...USER_ROLES]],
  ["/acces-limite", ["client"]],
];

describe("canAccessPath", () => {
  for (const [path, allowed] of EXPECTED) {
    for (const role of USER_ROLES) {
      it(`${role} ${allowed.includes(role) ? "peut" : "ne peut pas"} ouvrir ${path}`, () => {
        expect(canAccessPath(role, path)).toBe(allowed.includes(role));
      });
    }
  }

  it("refuse un chemin absent de la matrice, pour tous les rôles", () => {
    for (const role of USER_ROLES) {
      expect(canAccessPath(role, "/inconnu")).toBe(false);
      expect(canAccessPath(role, "/utilisateurs-secrets")).toBe(false);
    }
  });

  it("refuse un rôle absent ou inconnu", () => {
    expect(canAccessPath(undefined, "/")).toBe(false);
    expect(canAccessPath(null, "/")).toBe(false);
    expect(canAccessPath("root", "/")).toBe(false);
  });

  it("ignore la query string et le slash final", () => {
    expect(canAccessPath("lecture", "/clients/")).toBe(true);
    expect(canAccessPath("lecture", "/clients?x=1")).toBe(true);
    expect(canAccessPath("lecture", "/import/?x=1")).toBe(false);
  });

  it("n'autorise pas un identifiant d'opération mal formé pour le chauffeur", () => {
    expect(canAccessPath("chauffeur", "/operations/abc")).toBe(false);
    expect(canAccessPath("chauffeur", `/operations/${ID}/extra`)).toBe(false);
  });
});

describe("homePathFor", () => {
  it("renvoie l'accueil de chaque rôle", () => {
    expect(homePathFor("admin")).toBe("/");
    expect(homePathFor("dispatcher")).toBe("/");
    expect(homePathFor("lecture")).toBe("/");
    expect(homePathFor("chauffeur")).toBe("/terrain");
    expect(homePathFor("client")).toBe("/acces-limite");
    expect(homePathFor(undefined)).toBe("/");
  });

  it("renvoie toujours une page que le rôle a le droit d'ouvrir (pas de boucle de redirection)", () => {
    for (const role of USER_ROLES) {
      expect(canAccessPath(role, homePathFor(role))).toBe(true);
    }
  });
});
