import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { JetonRepositoryMongoose } from "@/backend/comptes/infrastructure/mongoose/jeton.repository.mongoose";
import { PasswordResetToken } from "@/backend/comptes/infrastructure/mongoose/jeton.model";

// `depot` : les fonctions libres historiques (`issueResetToken`/`consumeResetToken` de
// `@/lib/auth/reset-token`, supprimé) ont été transposées en `JetonRepositoryMongoose` (R3b, tâche
// 1). Ce fichier reste distinct de `jeton.repository.mongoose.test.ts` (le test de contrat du
// dépôt) : il vérifie en plus les index Mongo eux-mêmes et l'exactitude de l'empreinte SHA-256
// stockée, deux points que le test de contrat ne couvre pas.
const depot = new JetonRepositoryMongoose();
const uid = () => String(new mongoose.Types.ObjectId());
const T0 = new Date(Date.UTC(2026, 8, 20, 10, 0, 0));

function sha256Hex(valeur: string): string {
  return createHash("sha256").update(valeur).digest("hex");
}

describe("index des jetons", () => {
  it("l'index unique sur tokenHash et l'index TTL sur expiresAt existent", async () => {
    await PasswordResetToken.init();
    const indexes = await PasswordResetToken.collection.indexes();
    const byHash = indexes.find((i) => i.key.tokenHash === 1);
    const byExpiry = indexes.find((i) => i.key.expiresAt === 1);
    expect(byHash?.unique).toBe(true);
    expect(byExpiry?.expireAfterSeconds).toBe(86_400);
  });
});

describe("emettre", () => {
  it("génère un jeton de 43 caractères et ne stocke que son empreinte SHA-256", async () => {
    const userId = uid();
    const { token, expiresAt } = await depot.emettre(userId, "reset", T0);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(expiresAt.getTime()).toBe(T0.getTime() + 30 * 60 * 1000);

    const docs = await PasswordResetToken.find().lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].tokenHash).toBe(sha256Hex(token));
    expect(docs[0].tokenHash).not.toBe(token);
    expect(JSON.stringify(docs[0])).not.toContain(token);
    expect(docs[0].purpose).toBe("reset");
  });

  it("l'invitation vaut 72 heures", async () => {
    const { expiresAt } = await depot.emettre(uid(), "invitation", T0);
    expect(expiresAt.getTime()).toBe(T0.getTime() + 72 * 3600 * 1000);
  });

  it("un nouveau jeton invalide les jetons non utilisés du même utilisateur, pas ceux des autres", async () => {
    const a = uid();
    const b = uid();
    const first = await depot.emettre(a, "reset", T0);
    const other = await depot.emettre(b, "reset", T0);
    const second = await depot.emettre(a, "reset", T0);

    expect(await depot.consommer(first.token, T0)).toBeNull();
    expect(await depot.consommer(second.token, T0)).toEqual({ userId: a, finalite: "reset" });
    expect(await depot.consommer(other.token, T0)).toEqual({ userId: b, finalite: "reset" });
  });
});

describe("emettre : finalités et entrée", () => {
  it("émettre un jeton de réinitialisation laisse une invitation en attente utilisable", async () => {
    const userId = uid();
    const invitation = await depot.emettre(userId, "invitation", T0);
    const reset = await depot.emettre(userId, "reset", T0);

    expect(await PasswordResetToken.countDocuments({ userId, usedAt: null })).toBe(2);
    expect(await depot.consommer(invitation.token, T0)).toEqual({ userId, finalite: "invitation" });
    expect(await depot.consommer(reset.token, T0)).toEqual({ userId, finalite: "reset" });
  });

  it("émettre une invitation laisse un jeton de réinitialisation en attente utilisable", async () => {
    const userId = uid();
    const reset = await depot.emettre(userId, "reset", T0);
    const invitation = await depot.emettre(userId, "invitation", T0);

    expect(await depot.consommer(reset.token, T0)).toEqual({ userId, finalite: "reset" });
    expect(await depot.consommer(invitation.token, T0)).toEqual({ userId, finalite: "invitation" });
  });

  it("émettre deux fois la même finalité invalide le premier jeton, pour reset comme pour invitation", async () => {
    for (const purpose of ["reset", "invitation"] as const) {
      const userId = uid();
      const first = await depot.emettre(userId, purpose, T0);
      const second = await depot.emettre(userId, purpose, T0);

      expect(await PasswordResetToken.countDocuments({ userId, purpose })).toBe(1);
      expect(await depot.consommer(first.token, T0)).toBeNull();
      expect(await depot.consommer(second.token, T0)).toEqual({ userId, finalite: purpose });
    }
  });

  it("refuse un userId qui n'est pas un ObjectId valide, sans rien supprimer", async () => {
    const victim = uid();
    const kept = await depot.emettre(victim, "reset", T0);

    const invalid: unknown[] = [{ $ne: null }, "pas-un-objectid", "", null, undefined, 42, [victim]];
    for (const value of invalid) {
      await expect(depot.emettre(value as string, "reset", T0)).rejects.toThrow("userId invalide");
    }

    expect(await PasswordResetToken.countDocuments()).toBe(1);
    expect(await depot.consommer(kept.token, T0)).toEqual({ userId: victim, finalite: "reset" });
  });
});

describe("consommer", () => {
  it("ne sert qu'une seule fois", async () => {
    const userId = uid();
    const { token } = await depot.emettre(userId, "reset", T0);
    expect(await depot.consommer(token, T0)).toEqual({ userId, finalite: "reset" });
    expect(await depot.consommer(token, T0)).toBeNull();
  });

  it("refuse un jeton expiré (à la milliseconde près)", async () => {
    const { token, expiresAt } = await depot.emettre(uid(), "reset", T0);
    expect(await depot.consommer(token, new Date(expiresAt.getTime() + 1))).toBeNull();
  });

  it("accepte un jeton juste avant son expiration", async () => {
    const userId = uid();
    const { token, expiresAt } = await depot.emettre(userId, "reset", T0);
    expect(await depot.consommer(token, new Date(expiresAt.getTime() - 1))).toEqual({ userId, finalite: "reset" });
  });

  it("refuse un jeton inconnu ou mal formé sans lever", async () => {
    expect(await depot.consommer("", T0)).toBeNull();
    expect(await depot.consommer("court", T0)).toBeNull();
    expect(await depot.consommer("a".repeat(43), T0)).toBeNull();
    expect(await depot.consommer("{$ne:null}".padEnd(43, "x"), T0)).toBeNull();
  });

  it("refuse tout jeton qui n'est pas une chaîne (objet d'opérateur, tableau, null) sans rien consommer", async () => {
    const { token } = await depot.emettre(uid(), "reset", T0);
    const invalid: unknown[] = [{ $ne: null }, ["a".repeat(43)], [token], null, undefined, 42];
    for (const value of invalid) {
      expect(await depot.consommer(value as string, T0)).toBeNull();
    }
    expect(await PasswordResetToken.countDocuments({ usedAt: null })).toBe(1);
  });

  it("est atomique : deux consommations concurrentes, une seule réussit", async () => {
    const userId = uid();
    const { token } = await depot.emettre(userId, "reset", T0);
    const results = await Promise.all([depot.consommer(token, T0), depot.consommer(token, T0)]);
    const winners = results.filter(Boolean);
    expect(winners).toHaveLength(1);
    expect(winners[0]).toEqual({ userId, finalite: "reset" });
    expect(await PasswordResetToken.countDocuments({ usedAt: { $ne: null } })).toBe(1);
  });

  it("le jeton utilisé reste en base (traçabilité) avec usedAt renseigné", async () => {
    const { token } = await depot.emettre(uid(), "reset", T0);
    await depot.consommer(token, T0);
    const doc = await PasswordResetToken.findOne({ tokenHash: sha256Hex(token) }).lean<{ usedAt: Date | null }>();
    expect(doc?.usedAt).toBeInstanceOf(Date);
  });
});
