import { describe, expect, it } from "vitest";
import { guideSectionsForRole } from "./contenu";

const ids = (role: Parameters<typeof guideSectionsForRole>[0]) =>
  guideSectionsForRole(role).map((section) => section.id);

describe("visibilité du guide selon le rôle", () => {
  it("l'admin peut consulter tous les guides", () => {
    expect(ids("admin")).toEqual(["lecture", "dispatcher", "admin", "chauffeur", "client"]);
  });

  it("le dispatcher voit son guide et celui de lecture seule, mais pas les rôles supérieurs ou spécialisés", () => {
    expect(ids("dispatcher")).toEqual(["lecture", "dispatcher"]);
  });

  it("la lecture seule ne voit que son guide", () => {
    expect(ids("lecture")).toEqual(["lecture"]);
  });

  it("le chauffeur et le client ne voient que les informations de leur espace", () => {
    expect(ids("chauffeur")).toEqual(["chauffeur"]);
    expect(ids("client")).toEqual(["client"]);
  });
});
