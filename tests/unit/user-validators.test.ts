import { describe, it, expect } from "vitest";
import { userCreateSchema, userUpdateSchema } from "@/backend/comptes/http/utilisateur.schema";

const ID = "507f1f77bcf86cd799439011";
const base = { username: "jean_k", nom: "Jean K", email: "jean@srh.ci", telephone: "" };

const issues = (r: { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => `${i.path.join(".")}:${i.message}`);

describe.each([
  ["création", userCreateSchema],
  ["mise à jour", userUpdateSchema],
])("validateur d'utilisateur (%s)", (_name, schema) => {
  it("exige un clientId pour un compte client", () => {
    expect(issues(schema.safeParse({ ...base, role: "client" }))).toContainEqual(
      expect.stringContaining("clientId:")
    );
  });

  it("exige une équipe pour un chauffeur", () => {
    expect(issues(schema.safeParse({ ...base, role: "chauffeur" }))).toContainEqual(
      expect.stringContaining("equipeId:")
    );
  });

  it("refuse un identifiant qui n'est pas un ObjectId", () => {
    expect(schema.safeParse({ ...base, role: "client", clientId: "pas-un-id" }).success).toBe(false);
    expect(schema.safeParse({ ...base, role: "chauffeur", equipeId: "123" }).success).toBe(false);
  });

  it("accepte un client rattaché et un chauffeur rattaché", () => {
    expect(schema.safeParse({ ...base, role: "client", clientId: ID }).success).toBe(true);
    expect(schema.safeParse({ ...base, role: "chauffeur", equipeId: ID }).success).toBe(true);
  });

  it("refuse un rattachement étranger au rôle", () => {
    expect(schema.safeParse({ ...base, role: "dispatcher", clientId: ID }).success).toBe(false);
    expect(schema.safeParse({ ...base, role: "lecture", equipeId: ID }).success).toBe(false);
    expect(schema.safeParse({ ...base, role: "client", clientId: ID, equipeId: ID }).success).toBe(false);
    expect(schema.safeParse({ ...base, role: "chauffeur", equipeId: ID, clientId: ID }).success).toBe(false);
  });

  it("traite la chaîne vide comme « non renseigné »", () => {
    const r = schema.safeParse({ ...base, role: "dispatcher", clientId: "", equipeId: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.clientId).toBeUndefined();
      expect(r.data.equipeId).toBeUndefined();
    }
  });
});
