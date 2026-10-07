import { describe, it, expect } from "vitest";
import type { UserRole } from "@/shared/acces/roles";
import { estDansPerimetreClient } from "@/backend/clients-sites/domain/perimetre-client";

const dansPerimetre = (role: UserRole, clientIdCompte?: string, clientIdDocument?: string | null) =>
  estDansPerimetreClient(role, clientIdCompte, clientIdDocument);

describe("estDansPerimetreClient", () => {
  it("les rôles internes voient tout", () => {
    expect(dansPerimetre("admin", undefined, "507f1f77bcf86cd799439011")).toBe(true);
  });
  it.each(["dispatcher", "lecture", "chauffeur"])("%s : aucune restriction de client", (role) => {
    expect(dansPerimetre(role as UserRole, undefined, "507f1f77bcf86cd799439011")).toBe(true);
    expect(dansPerimetre(role as UserRole, undefined, undefined)).toBe(true);
  });
  it("un client rattaché ne voit pas un document sans clientId", () => {
    expect(dansPerimetre("client", "aaa", undefined)).toBe(false);
  });
  it("un client ne voit que son client", () => {
    expect(dansPerimetre("client", "aaa", "aaa")).toBe(true);
    expect(dansPerimetre("client", "aaa", "bbb")).toBe(false);
  });
  it("un client sans clientId ne voit rien, même si le document n'a pas de client", () => {
    expect(dansPerimetre("client", undefined, undefined)).toBe(false);
    expect(dansPerimetre("client", "", "")).toBe(false);
  });
});
