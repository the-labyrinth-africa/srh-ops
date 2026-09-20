import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { issueResetToken, consumeResetToken, hashToken } from "@/lib/auth/reset-token";
import { PasswordResetToken } from "@/models/PasswordResetToken";

const uid = () => String(new mongoose.Types.ObjectId());
const T0 = new Date(Date.UTC(2026, 8, 20, 10, 0, 0));

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

describe("issueResetToken", () => {
  it("génère un jeton de 43 caractères et ne stocke que son empreinte", async () => {
    const userId = uid();
    const { token, expiresAt } = await issueResetToken(userId, "reset", T0);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(expiresAt.getTime()).toBe(T0.getTime() + 30 * 60 * 1000);

    const docs = await PasswordResetToken.find().lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].tokenHash).toBe(hashToken(token));
    expect(docs[0].tokenHash).not.toBe(token);
    expect(JSON.stringify(docs[0])).not.toContain(token);
    expect(docs[0].purpose).toBe("reset");
  });

  it("l'invitation vaut 72 heures", async () => {
    const { expiresAt } = await issueResetToken(uid(), "invitation", T0);
    expect(expiresAt.getTime()).toBe(T0.getTime() + 72 * 3600 * 1000);
  });

  it("un nouveau jeton invalide les jetons non utilisés du même utilisateur, pas ceux des autres", async () => {
    const a = uid();
    const b = uid();
    const first = await issueResetToken(a, "reset", T0);
    const other = await issueResetToken(b, "reset", T0);
    const second = await issueResetToken(a, "reset", T0);

    expect(await consumeResetToken(first.token, T0)).toBeNull();
    expect(await consumeResetToken(second.token, T0)).toEqual({ userId: a, purpose: "reset" });
    expect(await consumeResetToken(other.token, T0)).toEqual({ userId: b, purpose: "reset" });
  });
});

describe("consumeResetToken", () => {
  it("ne sert qu'une seule fois", async () => {
    const userId = uid();
    const { token } = await issueResetToken(userId, "reset", T0);
    expect(await consumeResetToken(token, T0)).toEqual({ userId, purpose: "reset" });
    expect(await consumeResetToken(token, T0)).toBeNull();
  });

  it("refuse un jeton expiré (à la milliseconde près)", async () => {
    const { token, expiresAt } = await issueResetToken(uid(), "reset", T0);
    expect(await consumeResetToken(token, new Date(expiresAt.getTime() + 1))).toBeNull();
  });

  it("accepte un jeton juste avant son expiration", async () => {
    const userId = uid();
    const { token, expiresAt } = await issueResetToken(userId, "reset", T0);
    expect(await consumeResetToken(token, new Date(expiresAt.getTime() - 1))).toEqual({ userId, purpose: "reset" });
  });

  it("refuse un jeton inconnu ou mal formé sans lever", async () => {
    expect(await consumeResetToken("", T0)).toBeNull();
    expect(await consumeResetToken("court", T0)).toBeNull();
    expect(await consumeResetToken("a".repeat(43), T0)).toBeNull();
    expect(await consumeResetToken("{$ne:null}".padEnd(43, "x"), T0)).toBeNull();
  });

  it("est atomique : deux consommations concurrentes, une seule réussit", async () => {
    const { token } = await issueResetToken(uid(), "reset", T0);
    const results = await Promise.all([consumeResetToken(token, T0), consumeResetToken(token, T0)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("le jeton utilisé reste en base (traçabilité) avec usedAt renseigné", async () => {
    const { token } = await issueResetToken(uid(), "reset", T0);
    await consumeResetToken(token, T0);
    const doc = await PasswordResetToken.findOne({ tokenHash: hashToken(token) }).lean<{ usedAt: Date | null }>();
    expect(doc?.usedAt).toBeInstanceOf(Date);
  });
});
