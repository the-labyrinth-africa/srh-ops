// tests/unit/nav.test.ts
import { describe, it, expect } from "vitest";
import { navForRole } from "@/frontend/navigation";

const hrefs = (role: string) => navForRole(role).flatMap((s) => s.items.map((i) => i.href));

describe("navForRole", () => {
  it("admin voit tout, dont les demandes clients, Utilisateurs et Import", () => {
    const h = hrefs("admin");
    expect(h).toEqual(
      expect.arrayContaining(["/", "/terrain", "/operations/planning", "/operations", "/recurrences", "/tracabilite", "/demandes", "/import", "/clients", "/equipes", "/vehicules", "/equipements", "/utilisateurs"])
    );
  });

  it("dispatcher voit l'import mais pas les utilisateurs", () => {
    const h = hrefs("dispatcher");
    expect(h).toContain("/import");
    expect(h).toContain("/demandes");
    expect(h).not.toContain("/utilisateurs");
  });

  it("lecture ne voit ni la console terrain, ni l'import, ni les utilisateurs", () => {
    const h = hrefs("lecture");
    expect(h).toContain("/operations");
    expect(h).toContain("/tracabilite");
    expect(h).not.toContain("/terrain");
    expect(h).not.toContain("/import");
    expect(h).not.toContain("/utilisateurs");
  });

  it("lecture : liste exacte des entrées", () => {
    expect(hrefs("lecture")).toEqual([
      "/", "/operations/planning", "/operations", "/recurrences", "/tracabilite", "/clients", "/equipes", "/vehicules", "/equipements",
    ]);
  });

  it("dispatcher : liste exacte des entrées (lecture + terrain + import)", () => {
    expect([...hrefs("dispatcher")].sort()).toEqual(
      ["/", "/operations/planning", "/operations", "/recurrences", "/tracabilite", "/demandes", "/clients", "/equipes", "/vehicules", "/equipements", "/terrain", "/import"].sort()
    );
  });

  it("chauffeur ne voit que la console terrain", () => {
    expect(hrefs("chauffeur")).toEqual(["/terrain"]);
  });

  it("client ne voit que les entrées de son espace", () => {
    expect(hrefs("client")).toEqual(["/espace-client"]);
    expect(hrefs("client")).not.toContain("/clients");
    expect(hrefs("client")).not.toContain("/demandes");
  });

  it("rôle inconnu : rien", () => {
    expect(navForRole(undefined)).toEqual([]);
  });
});
