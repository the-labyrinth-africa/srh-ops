import { describe, it, expect } from "vitest";
import { isWithinClientScope } from "@/lib/api-auth";

const auth = (role: string, clientId?: string) => ({ role, clientId } as never);

describe("isWithinClientScope", () => {
  it("les rôles internes voient tout", () => {
    expect(isWithinClientScope(auth("admin"), "507f1f77bcf86cd799439011")).toBe(true);
  });
  it.each(["dispatcher", "lecture", "chauffeur"])("%s : aucune restriction de client", (role) => {
    expect(isWithinClientScope(auth(role), "507f1f77bcf86cd799439011")).toBe(true);
    expect(isWithinClientScope(auth(role), undefined)).toBe(true);
  });
  it("un client rattaché ne voit pas un document sans clientId", () => {
    expect(isWithinClientScope(auth("client", "aaa"), undefined)).toBe(false);
  });
  it("un client ne voit que son client", () => {
    expect(isWithinClientScope(auth("client", "aaa"), "aaa")).toBe(true);
    expect(isWithinClientScope(auth("client", "aaa"), "bbb")).toBe(false);
  });
  it("un client sans clientId ne voit rien, même si le document n'a pas de client", () => {
    expect(isWithinClientScope(auth("client"), undefined)).toBe(false);
    expect(isWithinClientScope(auth("client", ""), "")).toBe(false);
  });
});
